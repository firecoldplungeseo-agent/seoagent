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

## Calendly topology (resolved)

There is **one Calendly organization, administered by `hello@firecoldplunge.com`** (display
name "Nick Reed"). Evidence: org invitation notifications sent to that address linking to
`calendly.com/app/admin/users`, Admin Center digest emails, and a trial-conversion email
in Dec 2025. Members seen accepting invitations: Nick Reed (2026-03-05) and Scott Williams
(2026-03-06).

**Plan is paid, and Collective event types are therefore available.** Two independent
signals: the Admin Center and organization-users features are Teams-tier, and
`info@plungezero.com` runs two concurrently active event types ("Plunge Zero Dealer Intro"
and "Onboarding New WL Portal") where Free permits only one active at a time.

### Which Google account each Calendly seat writes with

Calendly creates Google events using the connected account's own OAuth token, so the
`creator` field on each event identifies the connection:

| Calendly seat hosts | Connected Google account |
|---|---|
| Plunge Zero Dealer Intro, Onboarding New WL Portal | `info@plungezero.com` |
| Plunge Zero Dealer Onboarding, Plunge Zero Dealer Video Call | `nick@plungezero.com` |
| Fire Cold Plunge Commercial Meeting, FCP Meeting – White Labeling, 30 Minute Meeting, WLP Training | `hello@firecoldplunge.com` |

Three seats, three different connected accounts, one org that Nick administers — so every
change below can be made by Nick himself from the Admin Center without borrowing anyone's
login.

### Bounded by evidence, not directly readable

No Calendly API exposes the "Check for conflicts" tick state, so it cannot be read from
outside the UI. The collisions bound it anyway:

- The `info@plungezero.com` seat does **not** have `hello@firecoldplunge.com` or
  `nick@plungezero.com` ticked — it booked over both.
- The `nick@plungezero.com` seat does **not** have `hello@firecoldplunge.com` ticked — it
  booked over it on Jul 9 and Jul 29.

### One item to eyeball in Admin Center

The Jul 7 event "Rachel Roth and Scott Williams FCP Commercial Intro" was created by
`hello@firecoldplunge.com` under event type "Fire Cold Plunge Commercial Meeting", with
`scott@firecoldplunge.com` as an attendee, while the host notification went to
`hello@`. That is consistent with either a shared FCP sales seat that Scott uses, or
Scott's own seat being connected to Nick's `hello@` calendar. If it is the latter, Scott's
bookings are writing to Nick's personal calendar — worth 30 seconds on the Users page to
confirm which.

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
3. **Calendly → Availability → Calendar settings**, for all three seats
   (`hello@firecoldplunge.com`, `nick@plungezero.com`, `info@plungezero.com`): add
   `hello@firecoldplunge.com`, `nick@plungezero.com`, and `nick@faceplungecompany.com`
   to **"Check for conflicts."** Nick can reach all three from the Admin Center.
   *Limit:* 6 calendar connections per seat on paid plans, so three is fine.
4. **Enable Tentative** in free/busy rules, so the 22 un-RSVP'd invites block.
5. **HubSpot:** point Scott's meeting links at a group/round-robin meeting that includes
   Nick, or stop auto-adding him. HubSpot checks Scott's calendar only and no Calendly
   setting reaches it. This caused 3 of the 7 collisions.

Order matters: step 1 gates step 3.

### Indeed interviews need no special handling
Indeed writes them onto `hello@firecoldplunge.com` as normal **opaque (busy)** events
(verified: `transparency` unset, i.e. default busy; `attendees: []`). Once `hello@` is in
the conflict-check list they block automatically. No Indeed integration required.

## Fix — Part B: `seo-agent calguard` (built)

Part A depends on every person configuring every future tool correctly. This enforces it
at the calendar layer, where all five tools agree.

```
seo-agent calguard                 # dry run — writes a report, touches nothing
seo-agent calguard --apply         # create/update/reap holds
seo-agent calguard --horizon 90    # protect further out (default 60 days)
```

Implementation: `src/modes/calguard.ts`, Calendar client in `src/lib/gcal.ts`, tests in
`src/modes/calguard.test.ts` (`npm test`).

### What counts as Nick's time

Mirrors **only events where Nick is organizer, creator, or attendee** — matching
`hello@firecoldplunge.com`, `nick@plungezero.com`, `nick@faceplungecompany.com`,
`ncreed11@gmail.com` — onto his other calendars as opaque `Busy (auto)` holds.

Never mirrors by calendar membership: `info@plungezero.com` carries other people's 1:1s
(Scott & Davie, Scott & Elle, Scott & Aaron) which are not Nick's time.

One exception, needed for the Indeed interviews: an event with **no attendees at all** on
a calendar that is Nick's own counts as his. Those placeholders carry no attendee list, so
an identity match alone would miss them. The same rule does not apply to
`info@plungezero.com`, which is flagged `own: false`.

### Excluded on purpose

- `transparency: transparent` — keeps the Ideal Week template bookable.
- All-day events — would otherwise blank out whole days.
- Events Nick declined; birthdays; working-location markers.
- The job's own holds, so runs do not feed on themselves.

Note that `needsAction` invitations **do** block. That is deliberate — it closes root
cause 4 without depending on the Calendly tentative toggle.

### Safety properties

- **Idempotent** (per `CLAUDE.md` rule 3): holds are keyed by source event ID in
  `extendedProperties.private.calguardKey`, so reruns update rather than duplicate. A
  moved source event patches its existing hold; a deleted one gets its hold reaped.
- **Dry-run by default** (rule 1 posture) — `--apply` is required to write.
- **State in `state/calguard.json`** (rule 2), report in `reports/calguard-<date>.md`.
- Holds carry **no source title or detail**, just `Busy (auto)`, so nothing leaks between
  brands. They are set `visibility: private` with reminders suppressed.
- Calendars that are not writable are detected up front via `accessRole` and reported as
  BLOCKED rather than failing mid-run.

### First dry run against live data (2026-07-26, 60-day window)

Run by driving `planHolds()` over real API output before the `GCAL_*` token existed.
Input: hello@ 99 events, info@ 52, nick@plungezero 5, faceplunge 9 (freeBusyReader).

Result: **98 holds, ~194h of new busy time** — 93 holds onto `nick@plungezero.com`
(191.8h) and 5 onto `hello@firecoldplunge.com` (2.3h). The asymmetry is expected: almost
all of Nick's real load lives on `hello@`, and his PZ calendar is nearly empty.

Two thirds of that volume is four recurring items:

| Source | Holds | Hours |
|---|---|---|
| ARAURIS Founders (Tue 11:00–19:00) | 9 | 72.0 |
| Deep Work / Deep work | 25 | 84.0 |
| Watch kids Martina pottery class | 8 | 8.0 |
| Everything else (24 distinct meetings) | 56 | ~30.0 |

**Open decision:** whether Nick's own solo blocks (Deep Work, pottery class, ~92h) should
block dealer bookings, or only real meetings should. Mirroring everything is maximum
protection but leaves the PZ Calendly with few slots.

#### Defect this dry run caught

`creator` was being treated as participation. Nick built the weekly 1:1 series from his
`hello@` account, which makes him the creator of **Scott's** 1:1s with Davie, Aaron and
Elle — meetings he does not attend. The first run mirrored all of them. Fixed: organizer
and attendee count, creator does not. That removed 39 spurious busy events.

#### Gap no rule can close

`1:1 — Nick & Scott (Scott runs)` has attendees
`[scott@firecoldplunge.com, info@plungezero.com]` — **Nick is not on his own 1:1.** Some
`1:1 — Nick & Tosha` instances are the same, listing only `[tdawnc1212@gmail.com,
info@plungezero.com]`. No matching rule can infer attendance that no calendar field
records, and title-matching on "Nick" would be far too fragile to trust.

These need fixing at the source — add one of Nick's addresses as an attendee on the 1:1
series. Until then they are invisible to calguard *and* to every booking tool, which is
the same root failure in a different place.

### Currently degraded

`nick@faceplungecompany.com` is `freeBusyReader`, so calguard can neither read its detail
nor write holds to it — the same wall the booking tools hit. It will report the calendar
as BLOCKED until Part A step 1 lands. Everything else still works meanwhile.

Also still outstanding: `GCAL_CLIENT_ID` / `GCAL_CLIENT_SECRET` / `GCAL_REFRESH_TOKEN`
need to be issued for `hello@firecoldplunge.com` with the
`https://www.googleapis.com/auth/calendar` scope. The `GSC_*` token will not work — its
grant excludes Calendar.
