# Calendly double-booking — diagnosis and fix

Analysis window: 2026-06-20 → 2026-08-10. Data pulled live from the Google Calendar API
as `hello@firecoldplunge.com`.

## Nick's calendars

| Calendar | Access from `hello@` | Role |
|---|---|---|
| `hello@firecoldplunge.com` | `owner` | Nick's personal work calendar (FCP) |
| `nick@plungezero.com` | `owner` | Nick's PZ calendar |
| `nick@faceplungecompany.com` | **`freeBusyReader`** | Nick's FacePlunge calendar — details hidden |
| `info@plungezero.com` | `owner` | Associate / shared PZ ops calendar (carries everyone's 1:1s) |

All four are only *co-visible* from the `hello@` login. That reads as "connected" in the
Google Calendar UI and means nothing to any booking tool.

## Measured damage

Restricting overlap detection to meetings Nick is genuinely a participant in — organizer,
creator, or attendee matching `hello@firecoldplunge.com`, `nick@plungezero.com`,
`nick@faceplungecompany.com`, or `ncreed11@gmail.com` — the window contains **20
collisions on Nick's own time, 7 of them created by an automated booking tool:**

| When | Tool that booked | Ran over | Which lives on |
|---|---|---|---|
| Jun 30 14:00 | HubSpot (Scott) | ARAURIS Founders 11:00–19:00 | faceplunge |
| Jul 1 14:00 | Calendly (`info@`) | Deep Work 13:00–17:00 | `hello@` |
| Jul 9 12:00 | Calendly (Nick's own) | Deep work 12:00–15:00 | `hello@` |
| Jul 17 13:15 | HubSpot (`scott@fcp`) | Deep Work 12:00–15:00 | `hello@` |
| Jul 17 14:00 | HubSpot (`scott@pz`) | same Deep Work | `hello@` |
| Jul 27 12:00 | Calendly (`info@`) | Hicham Jorio Indeed interview 12:00–12:15 | `hello@` |
| Jul 29 12:30 | Calendly (Nick's own) | Deep Work 09:00–13:00 | `hello@` |

Six of seven ran over an event living on `hello@firecoldplunge.com`. The seventh ran over
`nick@faceplungecompany.com`. Both are calendars no booking tool currently reads.

## Confirmed root causes

### 1. Nick is a guest, not a co-host, on the associate's Calendly
All 13 associate-booked meetings have `organizer: info@plungezero.com` with Nick as a
plain attendee. Calendly only checks availability for **hosts and co-hosts** — guests
added to a booking are never checked. Her Calendly consults her own calendar, finds it
free, books, then attaches Nick.

### 2. `hello@firecoldplunge.com` is in nobody's conflict-check list
"Check for conflicts" is a manual per-sub-calendar checkbox list, not automatic. The
tell: **Nick's own Calendly** booked over his own `hello@` Deep Work twice (Jul 9,
Jul 29). If his own tool can't see that calendar, nobody's can.

### 3. `nick@faceplungecompany.com` is shared at free/busy only
The API returns `accessRole: freeBusyReader`. Calendly's guidance is that a shared
calendar must be shared with read/write ("Make changes to events") to be usable for
conflict checking. This is also an audit blind spot — only 3 instances of one recurring
block were visible across seven weeks, so the true collision count against this calendar
is higher than measured.

### 4. Nick does not RSVP
22 of 34 events on `nick@plungezero.com` sit at `needsAction`. Google treats an
un-RSVP'd invite as *tentative*, and Calendly's default free/busy rules block
Busy / Working Elsewhere / Away — **tentative is a separate, off-by-default toggle.**

### 5. Five independent availability sources write to Nick's time
Calendly(`info@`) 13 bookings · Calendly(`nick@pz`) 2 · HubSpot Meetings
(`scott@plungezero`, `scott@firecoldplunge`) 5 · plus Huzzle, SureBright, 52Launch,
Priority1 booking direct. No Calendly setting governs the non-Calendly ones.

## Can `info@`'s event type natively reference Nick's calendars?

Yes — two native routes.

### Route 1 — Collective event type (recommended)
Convert "Plunge Zero Dealer Intro" to a **Collective** event type and add Nick as a
**co-host**. Calendly then only offers slots when all hosts are free, so it checks Nick's
calendars before showing availability. Nick's own Calendly user ticks
`nick@plungezero.com` and `hello@firecoldplunge.com` under "Check for conflicts".

Requires **Standard plan or above**.

Secondary benefit: as a co-host Nick becomes an organizer rather than a guest, so these
events land as busy on his calendar automatically — which sidesteps root cause 4 for this
event type.

### Route 2 — share Nick's calendars into her connected Google account
Share `nick@plungezero.com` and `hello@firecoldplunge.com` to whichever Google account
her Calendly user is connected to, with **"Make changes to events"**, then tick them under
her "Check for conflicts". Calendly lists every sub-calendar of a connected account,
including calendars shared into it.

**Caveat that decides it:** Calendly's conflict-check setting is **account-wide, not per
event type** — any calendar ticked applies to *all* of that user's event types. Her own
meetings would then block against Nick's entire schedule. Calendly does not support
per-event-type conflict calendars; their documented workaround is a separate user, which
is effectively Route 1.

**Recommendation: Route 1.**

## Fix — Part A (settings; UI click-work)

Calendly's public API cannot change calendar-sync settings or convert event types.

1. **Re-share `nick@faceplungecompany.com`** with **"Make changes to events"**, not
   "See only free/busy", to whichever Google account each Calendly user is connected to.
   Nothing else can see this calendar until this lands.
2. **Convert "Plunge Zero Dealer Intro" to a Collective event type with Nick as
   co-host** (Route 1 above). This is the fix for the reported complaint.
3. **Calendly → Availability → Calendar settings**, for every Calendly user: add
   `hello@firecoldplunge.com`, `nick@plungezero.com`, and `nick@faceplungecompany.com`
   to **"Check for conflicts."**
   *Plan note:* Calendly free allows 1 calendar connection; Standard and above allow 6.
4. **Enable Tentative** in free/busy rules, so the 22 un-RSVP'd invites block.
5. **HubSpot:** point Scott's meeting links at a group/round-robin meeting that includes
   Nick, or stop auto-adding him. HubSpot checks Scott's calendar only and no Calendly
   setting reaches it. This caused 3 of the 7 collisions.

Order matters: step 1 gates step 3.

### Indeed interviews need no special handling
Indeed writes them onto `hello@firecoldplunge.com` as normal **opaque (busy)** events
(verified: `transparency` unset, i.e. default busy; `attendees: []`). Once `hello@` is in
the conflict-check list they block automatically. No Indeed integration required.

## Fix — Part B (enforcement job, scoped)

Part A depends on every person configuring every future tool correctly. A mirror job
enforces it at the calendar layer, where all five tools agree.

Rule: mirror **only events where Nick is organizer, creator, or attendee** — matching
`hello@firecoldplunge.com`, `nick@plungezero.com`, `nick@faceplungecompany.com`,
`ncreed11@gmail.com` — onto his other calendars as opaque `Busy (auto)` holds. Never
mirror by calendar membership: `info@plungezero.com` carries other people's 1:1s
(Scott & Davie, Scott & Elle, Scott & Aaron) that are not Nick's time.

Design constraints, per `CLAUDE.md`:
- Idempotent: holds keyed by source event ID in `extendedProperties.private`, so
  re-running updates rather than duplicates (rule 3).
- State in `state/` (rule 2).
- Dry-run by default (rule 1 posture).
- Skips `transparency: transparent`, so the Ideal Week time-blocks stay bookable.
- Skips events Nick declined, and all-day birthdays.
- Hold titles carry no detail — just `Busy (auto)` — so nothing leaks between brands.
- Reaps holds whose source event was deleted or moved.

Degraded until Part A step 1 lands: the job cannot read
`nick@faceplungecompany.com` at `freeBusyReader` either — the same wall the booking
tools hit.
