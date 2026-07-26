import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHolds, DEFAULT_CALENDARS, type CalendarSpec } from './calguard.js';
import { GUARD_FLAG, GUARD_KEY, type GcalEvent } from '../lib/gcal.js';

/**
 * Fixtures mirror the real event shapes observed on Nick's calendars while
 * diagnosing the double-booking issue (see docs/calendar-double-booking.md).
 */

const HELLO = 'hello@firecoldplunge.com';
const PZ = 'nick@plungezero.com';
const FACE = 'nick@faceplungecompany.com';
const INFO = 'info@plungezero.com';

const WRITABLE = new Set([HELLO, PZ, FACE]);

function ev(over: Partial<GcalEvent> & { id: string }): GcalEvent {
  return {
    status: 'confirmed',
    eventType: 'DEFAULT',
    start: { dateTime: '2026-07-27T12:00:00-05:00', timeZone: 'America/Chicago' },
    end: { dateTime: '2026-07-27T12:30:00-05:00', timeZone: 'America/Chicago' },
    ...over,
  };
}

function plan(events: Record<string, GcalEvent[]>, cals: CalendarSpec[] = DEFAULT_CALENDARS) {
  return planHolds(new Map(Object.entries(events)), cals, WRITABLE);
}

test('the ARAURIS block on faceplunge gets mirrored onto the other calendars', () => {
  // This is the one provably missed collision: HubSpot booked over this because
  // nothing else could see the faceplunge calendar.
  const arauris = ev({
    id: 'arauris1',
    summary: 'ARAURIS FOUNDERS SETUP MEETING',
    start: { dateTime: '2026-06-30T11:00:00-05:00' },
    end: { dateTime: '2026-06-30T19:00:00-05:00' },
    organizer: { email: FACE },
    attendees: [{ email: FACE }, { email: 'scott@arauris.com' }, { email: HELLO }],
  });
  // Already on hello@ and faceplunge (it is an invitation to both).
  const { plans, busy } = plan({ [HELLO]: [arauris], [PZ]: [], [FACE]: [arauris], [INFO]: [] });

  assert.equal(busy.size, 1);
  const creates = plans.filter((p) => p.action === 'create');
  assert.deepEqual(
    creates.map((p) => p.calendarId),
    [PZ],
    'only the calendar that lacks it should get a hold',
  );
  assert.equal(creates[0].start, '2026-06-30T11:00:00-05:00');
});

test("other people's 1:1s on the shared ops calendar are not Nick's time", () => {
  const scottDavie = ev({
    id: 'scottdavie',
    summary: '1:1 — Scott & Davie',
    organizer: { email: INFO },
    attendees: [{ email: INFO }, { email: 'scott@plungezero.com' }, { email: 'davie@plungezero.com' }],
  });
  const { plans, busy } = plan({ [HELLO]: [], [PZ]: [], [FACE]: [], [INFO]: [scottDavie] });
  assert.equal(busy.size, 0, 'no identity match on a non-own calendar');
  assert.equal(plans.length, 0);
});

test('an attendee-less event on a shared calendar is still not Nick, but on his own it is', () => {
  const orphan = ev({ id: 'orphan', summary: 'Some ops task', organizer: { email: INFO } });
  const onShared = plan({ [HELLO]: [], [PZ]: [], [FACE]: [], [INFO]: [orphan] });
  assert.equal(onShared.busy.size, 0);

  // The Indeed interview placeholders look exactly like this: no attendees at all,
  // sitting on Nick's own calendar. He still attends them.
  const indeed = ev({
    id: 'indeed1',
    summary: 'Fire Cold Plunge video interview with Hicham Jorio',
    organizer: { email: HELLO },
    creator: { email: HELLO },
    attendees: [],
  });
  const onOwn = plan({ [HELLO]: [indeed], [PZ]: [], [FACE]: [], [INFO]: [] });
  assert.equal(onOwn.busy.size, 1, 'attendee-less event on his own calendar counts');
  assert.deepEqual(
    onOwn.plans.filter((p) => p.action === 'create').map((p) => p.calendarId).sort(),
    [FACE, PZ],
  );
});

test('transparent Ideal Week blocks never produce holds', () => {
  const idealWeek = ev({
    id: 'bigrocks',
    summary: 'Big Rocks',
    organizer: { email: HELLO },
    transparency: 'transparent',
  });
  const { plans, busy } = plan({ [HELLO]: [idealWeek], [PZ]: [], [FACE]: [], [INFO]: [] });
  assert.equal(busy.size, 0, 'free time must stay bookable');
  assert.equal(plans.length, 0);
});

test('declined events and birthdays and all-day events are skipped', () => {
  const declined = ev({
    id: 'declined1',
    summary: '30 min with Scott (Mike Degen)',
    organizer: { email: 'scott@plungezero.com' },
    attendees: [{ email: PZ, responseStatus: 'declined' }],
  });
  const birthday = ev({
    id: 'bday',
    summary: "Mom's Birthday",
    eventType: 'BIRTHDAY',
    organizer: { email: HELLO },
  });
  const allDay = ev({
    id: 'allday',
    summary: 'Out of office',
    organizer: { email: HELLO },
    start: { date: '2026-07-24' },
    end: { date: '2026-07-25' },
  });
  const { busy } = plan({ [HELLO]: [birthday, allDay], [PZ]: [declined], [FACE]: [], [INFO]: [] });
  assert.equal(busy.size, 0);
});

test('unaccepted invitations still block — this is the tentative gap Calendly leaves open', () => {
  const pending = ev({
    id: 'pending1',
    summary: 'ADAM and Plunge Zero',
    organizer: { email: INFO },
    attendees: [{ email: PZ, responseStatus: 'needsAction' }, { email: INFO }],
  });
  const { busy } = plan({ [HELLO]: [], [PZ]: [pending], [FACE]: [], [INFO]: [pending] });
  assert.equal(busy.size, 1, 'needsAction is not declined');
});

test('rerunning is idempotent — existing holds produce no further creates', () => {
  const source = ev({
    id: 'src1',
    summary: 'Dealer Product Training',
    organizer: { email: PZ },
    attendees: [{ email: PZ }],
  });
  const hold = (key: string, id: string): GcalEvent =>
    ev({
      id,
      summary: 'Busy (auto)',
      extendedProperties: { private: { [GUARD_FLAG]: '1', [GUARD_KEY]: key } },
    });

  const first = plan({ [HELLO]: [], [PZ]: [source], [FACE]: [], [INFO]: [] });
  assert.equal(first.plans.filter((p) => p.action === 'create').length, 2);

  const second = plan({
    [HELLO]: [hold('src1', 'h1')],
    [PZ]: [source],
    [FACE]: [hold('src1', 'h2')],
    [INFO]: [],
  });
  assert.equal(second.plans.length, 0, 'second run must be a no-op');
});

test('a moved source event updates its holds rather than duplicating them', () => {
  const moved = ev({
    id: 'src2',
    summary: 'Dealer intro',
    organizer: { email: PZ },
    attendees: [{ email: PZ }],
    start: { dateTime: '2026-07-27T15:00:00-05:00' },
    end: { dateTime: '2026-07-27T15:30:00-05:00' },
  });
  const staleHold = ev({
    id: 'h3',
    summary: 'Busy (auto)',
    start: { dateTime: '2026-07-27T12:00:00-05:00' },
    end: { dateTime: '2026-07-27T12:30:00-05:00' },
    extendedProperties: { private: { [GUARD_FLAG]: '1', [GUARD_KEY]: 'src2' } },
  });
  const { plans } = plan({ [HELLO]: [staleHold], [PZ]: [moved], [FACE]: [], [INFO]: [] });
  const updates = plans.filter((p) => p.action === 'update');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].existingId, 'h3');
  assert.equal(updates[0].start, '2026-07-27T15:00:00-05:00');
  assert.equal(plans.filter((p) => p.action === 'create' && p.calendarId === HELLO).length, 0);
});

test('orphaned holds are reaped when their source disappears', () => {
  const orphanHold = ev({
    id: 'h4',
    summary: 'Busy (auto)',
    extendedProperties: { private: { [GUARD_FLAG]: '1', [GUARD_KEY]: 'gone-forever' } },
  });
  const { plans } = plan({ [HELLO]: [orphanHold], [PZ]: [], [FACE]: [], [INFO]: [] });
  assert.deepEqual(
    plans.map((p) => [p.action, p.existingId]),
    [['delete', 'h4']],
  );
});

test('a calendar we cannot write to is never planned against', () => {
  const source = ev({
    id: 'src3',
    summary: 'ARAURIS FOUNDERS SETUP MEETING',
    organizer: { email: FACE },
    attendees: [{ email: FACE }],
  });
  // faceplunge readable but not writable, as it is today at freeBusyReader.
  const { plans } = planHolds(
    new Map([
      [HELLO, []],
      [PZ, []],
      [FACE, [source]],
      [INFO, []],
    ]),
    DEFAULT_CALENDARS,
    new Set([HELLO, PZ]),
  );
  assert.deepEqual(
    plans.map((p) => p.calendarId).sort(),
    [HELLO, PZ],
    'holds go to the writable calendars only',
  );
});
