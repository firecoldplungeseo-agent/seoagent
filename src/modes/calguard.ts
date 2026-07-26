import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  GcalClient,
  GcalError,
  GUARD_FLAG,
  GUARD_KEY,
  type GcalEvent,
} from '../lib/gcal.js';

/**
 * calguard — cross-calendar busy mirroring.
 *
 * Nick's time is spread across four calendars, and each booking tool (two Calendly
 * accounts, HubSpot Meetings on two domains, plus assorted external schedulers) only
 * ever consults one of them. This mirrors every event that is genuinely Nick's onto
 * his other calendars as an opaque "Busy (auto)" hold, so a tool sees a conflict no
 * matter which calendar it happens to check.
 *
 * See docs/calendar-double-booking.md for the diagnosis this implements.
 */

export interface CalendarSpec {
  id: string;
  /**
   * True when the calendar belongs to Nick personally. On an own calendar an event
   * with no attendees still counts as his time — that is how the Indeed interview
   * placeholders, which carry no attendees at all, get picked up. On a shared
   * calendar (info@) an explicit identity match is required instead, so other
   * people's 1:1s are not mistaken for his.
   */
  own: boolean;
  /** Whether holds may be written here. */
  mirror: boolean;
}

/** Every address that means "this is Nick". */
export const NICK_IDENTITIES = [
  'hello@firecoldplunge.com',
  'nick@plungezero.com',
  'nick@faceplungecompany.com',
  'ncreed11@gmail.com',
];

export const DEFAULT_CALENDARS: CalendarSpec[] = [
  { id: 'hello@firecoldplunge.com', own: true, mirror: true },
  { id: 'nick@plungezero.com', own: true, mirror: true },
  { id: 'nick@faceplungecompany.com', own: true, mirror: true },
  // Shared ops calendar: read as a source, never written to.
  { id: 'info@plungezero.com', own: false, mirror: false },
];

const HOLD_TITLE = 'Busy (auto)';

export interface CalguardOptions {
  repoRoot: string;
  /** Days back from now to consider. Past events cannot be double-booked. */
  lookbackDays?: number;
  /** Days forward to protect. */
  horizonDays?: number;
  /** When false (the default) nothing is written — the plan is reported only. */
  apply?: boolean;
  calendars?: CalendarSpec[];
}

interface BusyEvent {
  key: string;
  summary: string;
  start: string;
  end: string;
  sourceCal: string;
  /** Calendars this same event already occupies, so we do not hold against itself. */
  occupies: Set<string>;
}

export interface HoldPlan {
  action: 'create' | 'update' | 'delete';
  calendarId: string;
  key: string;
  start?: string;
  end?: string;
  sourceSummary?: string;
  existingId?: string;
  reason?: string;
}

/**
 * Pure planner: given the events on each calendar, work out which holds to create,
 * move, or reap. Kept free of the API client so it can be exercised against captured
 * calendar data.
 */
export function planHolds(
  eventsByCalendar: Map<string, GcalEvent[]>,
  calendars: CalendarSpec[],
  writableCalendarIds: Set<string>,
): { plans: HoldPlan[]; busy: Map<string, BusyEvent> } {
  const busy = new Map<string, BusyEvent>();
  const existingHolds = new Map<string, Map<string, GcalEvent>>();

  for (const cal of calendars) {
    const holds = new Map<string, GcalEvent>();
    for (const ev of eventsByCalendar.get(cal.id) ?? []) {
      if (ev.extendedProperties?.private?.[GUARD_FLAG] === '1') {
        const key = ev.extendedProperties.private[GUARD_KEY];
        if (key) holds.set(key, ev);
        continue;
      }
      if (!isNicksBusyTime(ev, cal)) continue;
      const found = busy.get(ev.id);
      if (found) {
        found.occupies.add(cal.id);
      } else {
        busy.set(ev.id, {
          key: ev.id,
          summary: ev.summary ?? '(no title)',
          start: ev.start!.dateTime!,
          end: ev.end!.dateTime!,
          sourceCal: cal.id,
          occupies: new Set([cal.id]),
        });
      }
    }
    existingHolds.set(cal.id, holds);
  }

  const targets = calendars.filter((c) => c.mirror && writableCalendarIds.has(c.id));
  const plans: HoldPlan[] = [];
  const desiredByCal = new Map<string, Set<string>>();
  for (const t of targets) desiredByCal.set(t.id, new Set());

  for (const ev of busy.values()) {
    for (const t of targets) {
      if (ev.occupies.has(t.id)) continue; // already really on this calendar
      desiredByCal.get(t.id)!.add(ev.key);
      const existing = existingHolds.get(t.id)?.get(ev.key);
      if (!existing) {
        plans.push({
          action: 'create',
          calendarId: t.id,
          key: ev.key,
          start: ev.start,
          end: ev.end,
          sourceSummary: ev.summary,
        });
      } else if (existing.start?.dateTime !== ev.start || existing.end?.dateTime !== ev.end) {
        plans.push({
          action: 'update',
          calendarId: t.id,
          key: ev.key,
          start: ev.start,
          end: ev.end,
          sourceSummary: ev.summary,
          existingId: existing.id,
          reason: `moved from ${existing.start?.dateTime ?? '?'} to ${ev.start}`,
        });
      }
    }
  }

  // Reap holds whose source event is gone, moved out of the window, or is now
  // genuinely present on the target calendar.
  for (const t of targets) {
    const desired = desiredByCal.get(t.id)!;
    for (const [key, hold] of existingHolds.get(t.id) ?? []) {
      if (!desired.has(key)) {
        plans.push({
          action: 'delete',
          calendarId: t.id,
          key,
          existingId: hold.id,
          start: hold.start?.dateTime,
          reason: 'source event no longer requires a hold here',
        });
      }
    }
  }

  return { plans, busy };
}

export async function runCalguard(opts: CalguardOptions): Promise<void> {
  const {
    repoRoot,
    lookbackDays = 1,
    horizonDays = 60,
    apply = false,
    calendars = DEFAULT_CALENDARS,
  } = opts;

  const client = GcalClient.fromEnv();
  const now = new Date();
  const timeMin = new Date(now.getTime() - lookbackDays * 864e5).toISOString();
  const timeMax = new Date(now.getTime() + horizonDays * 864e5).toISOString();

  console.log(`[calguard] window ${timeMin.slice(0, 10)} → ${timeMax.slice(0, 10)}`);
  console.log(`[calguard] mode: ${apply ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);

  // Surface access problems up front — a calendar we can only read as free/busy is the
  // same wall the booking tools hit, and holds cannot be written there.
  const access = new Map<string, string>();
  for (const entry of await client.listCalendars()) {
    access.set(entry.id, entry.accessRole ?? 'unknown');
  }
  const blocked: string[] = [];
  for (const cal of calendars) {
    const role = access.get(cal.id);
    if (!role) {
      blocked.push(`${cal.id}: not in this account's calendar list`);
    } else if (cal.mirror && role !== 'owner' && role !== 'writer') {
      blocked.push(`${cal.id}: accessRole=${role} — cannot write holds (needs owner or writer)`);
    }
  }
  for (const b of blocked) console.warn(`[calguard] BLOCKED ${b}`);

  // --- gather ---
  const eventsByCalendar = new Map<string, GcalEvent[]>();
  const fetchErrors: string[] = [];

  for (const cal of calendars) {
    try {
      const events = await client.listEvents(cal.id, timeMin, timeMax);
      eventsByCalendar.set(cal.id, events);
      console.log(`[calguard] ${cal.id}: ${events.length} events fetched`);
    } catch (e) {
      const msg = `${cal.id}: ${(e as Error).message}`;
      fetchErrors.push(msg);
      console.warn(`[calguard] fetch failed ${msg}`);
    }
  }

  // --- plan ---
  const writable = new Set(
    calendars.filter((c) => c.mirror && !blocked.some((b) => b.startsWith(c.id))).map((c) => c.id),
  );
  const { plans, busy } = planHolds(eventsByCalendar, calendars, writable);
  console.log(`[calguard] ${busy.size} events are Nick's busy time`);

  // --- execute ---
  const failures: string[] = [];
  if (apply) {
    for (const p of plans) {
      try {
        if (p.action === 'create') {
          await client.insertEvent(p.calendarId, holdBody(p));
        } else if (p.action === 'update') {
          await client.patchEvent(p.calendarId, p.existingId!, {
            start: { dateTime: p.start },
            end: { dateTime: p.end },
          });
        } else {
          await client.deleteEvent(p.calendarId, p.existingId!);
        }
      } catch (e) {
        const detail =
          e instanceof GcalError ? `HTTP ${e.statusCode}` : (e as Error).message;
        failures.push(`${p.action} ${p.key} on ${p.calendarId}: ${detail}`);
      }
    }
  }

  // --- report ---
  const summary = {
    ranAt: now.toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    window: { timeMin, timeMax },
    busyEvents: busy.size,
    creates: plans.filter((p) => p.action === 'create').length,
    updates: plans.filter((p) => p.action === 'update').length,
    deletes: plans.filter((p) => p.action === 'delete').length,
    blocked,
    fetchErrors,
    failures,
  };

  await mkdir(join(repoRoot, 'state'), { recursive: true });
  await writeFile(
    join(repoRoot, 'state', 'calguard.json'),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8',
  );

  const reportDir = join(repoRoot, 'reports');
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `calguard-${now.toISOString().slice(0, 10)}.md`);
  await writeFile(reportPath, renderReport(summary, plans, busy), 'utf8');

  console.log(
    `[calguard] ${summary.creates} create, ${summary.updates} update, ${summary.deletes} delete` +
      (apply ? '' : ' (planned — rerun with --apply to write)'),
  );
  if (failures.length) {
    console.error(`[calguard] ${failures.length} operation(s) failed:`);
    for (const f of failures) console.error(`  ${f}`);
  }
  console.log(`[calguard] report: ${reportPath}`);
  console.log(`[calguard] state:  state/calguard.json`);
}

/**
 * An event counts as Nick's busy time when it blocks a real slot on his day.
 *
 * Deliberately excluded:
 * - transparent ("Free") events, so the Ideal Week template stays bookable
 * - all-day events, which would otherwise blank out whole days
 * - anything Nick declined
 * - birthdays and working-location markers
 */
function isNicksBusyTime(ev: GcalEvent, cal: CalendarSpec): boolean {
  if (ev.status === 'cancelled') return false;
  if (ev.transparency === 'transparent') return false;
  if (ev.eventType === 'BIRTHDAY' || ev.eventType === 'WORKING_LOCATION') return false;
  if (!ev.start?.dateTime || !ev.end?.dateTime) return false;
  if (ev.start.dateTime === ev.end.dateTime) return false;

  const attendees = ev.attendees ?? [];
  const mine = attendees.filter((a) => isNick(a.email));
  if (mine.some((a) => a.responseStatus === 'declined')) return false;

  if (mine.length > 0) return true;
  if (isNick(ev.organizer?.email) || isNick(ev.creator?.email)) return true;
  // No attendees at all on a calendar that is his: still his time. This is what
  // catches the Indeed interview placeholders.
  if (cal.own && attendees.length === 0) return true;
  return false;
}

function isNick(email?: string): boolean {
  if (!email) return false;
  return NICK_IDENTITIES.includes(email.toLowerCase());
}

function holdBody(p: HoldPlan): Partial<GcalEvent> {
  return {
    summary: HOLD_TITLE,
    // No source title: these holds cross brand boundaries, so they carry no detail.
    description:
      'Availability hold generated by seo-agent calguard so booking tools see this ' +
      'slot as busy on every one of Nick\'s calendars. Manual edits will be ' +
      'overwritten on the next run; change the source event instead.',
    start: { dateTime: p.start },
    end: { dateTime: p.end },
    transparency: 'opaque',
    visibility: 'private',
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: {
      private: { [GUARD_FLAG]: '1', [GUARD_KEY]: p.key },
    },
  };
}

function renderReport(
  summary: Record<string, unknown>,
  plans: HoldPlan[],
  busy: Map<string, BusyEvent>,
): string {
  const L: string[] = [];
  L.push(`# calguard — ${summary.mode}`);
  L.push('');
  L.push(`Ran: ${summary.ranAt}`);
  L.push(`Window: ${summary.window && (summary.window as { timeMin: string }).timeMin.slice(0, 10)} → ${(summary.window as { timeMax: string }).timeMax.slice(0, 10)}`);
  L.push('');
  L.push(
    `**${summary.busyEvents} events are Nick's busy time.** ` +
      `Plan: ${summary.creates} create, ${summary.updates} update, ${summary.deletes} delete.`,
  );
  L.push('');

  const blocked = summary.blocked as string[];
  if (blocked.length) {
    L.push('## Blocked calendars');
    L.push('');
    L.push('These cannot be written to, so they stay unprotected:');
    L.push('');
    for (const b of blocked) L.push(`- ${b}`);
    L.push('');
  }

  const fetchErrors = summary.fetchErrors as string[];
  if (fetchErrors.length) {
    L.push('## Fetch errors');
    L.push('');
    for (const f of fetchErrors) L.push(`- ${f}`);
    L.push('');
  }

  const failures = summary.failures as string[];
  if (failures.length) {
    L.push('## Failed operations');
    L.push('');
    for (const f of failures) L.push(`- ${f}`);
    L.push('');
  }

  for (const action of ['create', 'update', 'delete'] as const) {
    const rows = plans.filter((p) => p.action === action);
    if (!rows.length) continue;
    L.push(`## ${action} (${rows.length})`);
    L.push('');
    L.push('| When | Target calendar | Source event | Note |');
    L.push('|---|---|---|---|');
    for (const p of rows.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))) {
      const when = p.start ? p.start.slice(0, 16).replace('T', ' ') : '—';
      const src = p.sourceSummary ?? busy.get(p.key)?.summary ?? '(gone)';
      L.push(`| ${when} | ${p.calendarId} | ${src.replace(/\|/g, '\\|')} | ${p.reason ?? ''} |`);
    }
    L.push('');
  }

  if (!plans.length) {
    L.push('Nothing to do — every calendar already reflects the others.');
    L.push('');
  }
  return L.join('\n');
}
