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

### Correction 2026-07-27: four seats, not three

Browser-verified from the Calendly Users list: **four** active users, 4 of 6 seats used.

| User | Role |
|---|---|
| `hello@firecoldplunge.com` | Owner |
| `nick@plungezero.com` | Admin |
| `scott@plungezero.com` | Admin |
| `info@plungezero.com` | User |

The three-seat table above was inferred from the `creator` field on booked events, which
only surfaces seats that actually created something in the sampled window. Scott has a
seat but did not appear because **he books through HubSpot Meetings, not Calendly** — his
events carry HubSpot's "Booked by" signature.

Two consequences: Round Robin needs no provisioning for Scott, and he is paying for a
Calendly seat while booking through the one channel that sits outside every fix here.
Migrating him onto the seat he already has would bring him under the same
conflict-checking regime.

### Two operational corrections

**Conflict-check calendars are per-user with no admin override.** An org owner can manage
users, roles, billing, managed events and workflows, but cannot edit another member's
conflict-calendar selection. Each seat must be set from its own login. In practice this is
one login, not three: only `nick@plungezero.com` needs it, because only Nick's time is
scattered across three calendars. Scott's seat covers his own single calendar already, and
`info@`'s seat stops hosting dealer intros once Round Robin lands.

**There is no "Tentative" free/busy toggle in the current Calendly UI.** An earlier
revision of this doc recommended enabling one, sourced from a help-article summary that
could not be fetched directly. A page-text search for "tentative", "free/busy", "RSVP" and
"maybe" across Calendar settings and Advanced settings returned nothing. The conflict
modal offers per-calendar checkboxes only.

This costs nothing: calguard already treats `needsAction` as busy, which is why root
cause 4 was deliberately closed in code rather than by configuration.

**Free/busy-only sharing appears sufficient for conflict checking.** `hello@`'s seat was
able to tick `nick@faceplungecompany.com` while that calendar is still `freeBusyReader`.
The read/write requirement cited earlier came from community posts and likely conflated
conflict checking with the "add to calendar" target, which genuinely does need write. Treat
the write upgrade as desirable — calguard needs it to place holds there — but not as a
blocker for Calendly conflict checking. Worth confirming empirically: put a busy block on
the faceplunge calendar and check it disappears from the seat's booking page.

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

### 0. The attendee automation cannot prevent double-booking, by construction

An automation (not in this repo — Zapier/Make/HubSpot/Apps Script) adds
`nick@plungezero.com` and `scott@plungezero.com` to sales events booked on
`info@plungezero.com`.

It runs **after** the booking is confirmed. That is an ordering problem, not a tuning
problem: by the time it fires the dealer already holds a confirmed slot, so attaching Nick
can only record the conflict, never prevent it. Before it runs the clash does not exist on
Nick's calendar; after it runs, it does.

What it actually produces, measured across upcoming `info@` events:

| RSVP state | `nick@plungezero.com` | `scott@plungezero.com` |
|---|---|---|
| accepted | 0 | 0 |
| needsAction | 4 | 1 |
| declined (OOO auto-decline) | 0 | 3 |

Every dealer intro looks staffed; none is confirmed. The automation attaches names, not
commitments. It is a notification mechanism being used as a scheduling mechanism.

**Keep it only for people whose availability is not gating** — Scott is a reasonable use
case. Remove Nick from it once he is a Calendly co-host, or it will churn against events
Calendly already populates.

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

### Route 0 — Round Robin with priority stars (RECOMMENDED for Dealer Intro)

Ownership model, per Nick: **Scott owns dealer intros; Nick is backup/secondary.** That
makes Collective the wrong shape — it requires *all* hosts free, which would gate every
dealer intro on the availability of someone who is usually not needed.

Correct shape is a **Round Robin** event type with priority stars (Standard plan and
above):

| Host | Priority |
|---|---|
| `scott@plungezero.com` | high (starred) |
| `nick@plungezero.com` | low |

Calendly books the highest-priority *available* host, so Scott takes dealer intros
whenever he is free and Nick only fills in when Scott is not.

**Why this handles the current situation with no manual intervention.** Scott is out for
two weeks. Google `OUT_OF_OFFICE` events set status to Busy and auto-decline invitations —
and the `"Declined because I am out of office"` comments on his existing invites are
Google's OOO auto-decline, which only fires from a real OOO event. So his free/busy
genuinely reads busy. Round Robin will find him unavailable, route to Nick, and check
Nick's real availability *before* offering the slot. When Scott returns it reverts by
itself. Nothing to toggle, nothing to remember to change back.

Neither host can be double-booked, because assignment happens against live free/busy at
the moment the invitee picks a time — which is the ordering property the stapling
automation can never have.

**Prerequisite that still matters:** Nick's Calendly seat must list
`hello@firecoldplunge.com`, `nick@plungezero.com` and `nick@faceplungecompany.com` under
"Check for conflicts". Otherwise Round Robin routes to him while seeing only his PZ
calendar — which is exactly the Jul 27 failure, just with an extra step.

**What happens to the automation:** drop `nick@` and `scott@` from it entirely. Round
Robin assigns one real host with a real RSVP, which is strictly better than two stapled
attendees who are unconfirmed and OOO-declined. Keep it only if the associate herself
needs to be attached as an attendee.

### Route 1 — Collective event type
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

> **Update 2026-07-27 15:18Z — ARAURIS declined.** All 9 instances of the ARAURIS Founders
> series (Jul 28 → Sep 22) were declined by both `nick@faceplungecompany.com` (its
> organizer) and `hello@firecoldplunge.com`. calguard skips declined events, so those 72h
> leave the plan: **~194h → ~122h**, the Jul 28 collision disappears, and the
> "mirror everything" and "all-but-ARAURIS" options now converge on the same number. The
> series still exists on `hello@`; it is declined, not deleted, so it will return to the
> plan if the RSVP is reversed.
>
> Side effect worth knowing: declined events drop out of the faceplunge view entirely, so
> that calendar now reads as empty from `hello@`. That is the decline, not a sharing
> change — `accessRole` is still `freeBusyReader`.

#### Defect this dry run caught

`creator` was being treated as participation. Nick built the weekly 1:1 series from his
`hello@` account, which makes him the creator of **Scott's** 1:1s with Davie, Aaron and
Elle — meetings he does not attend. The first run mirrored all of them. Fixed: organizer
and attendee count, creator does not. That removed 39 spurious busy events.

#### Forward-looking verification (next 60 days)

98 of Nick's busy events contain **15 overlaps**, which split into two very different
groups:

- **2 cross-calendar** — the actual double-booking problem, both caused by Calendly:
  Jul 27 12:00 (Hicham Jorio interview on `hello@` vs Rhynan Fay dealer intro on
  `nick@plungezero`) and Jul 29 09:00 (Deep Work on `hello@` vs Colorado Saunas dealer
  training on `nick@plungezero`). calguard prevents exactly this class.
- **13 same-calendar**, all within `hello@` — mostly a standing "Winston meeting" sitting
  inside a Deep Work block, recurring weekly. These are Nick layering his own entries on
  one calendar. calguard cannot and should not touch them; no booking tool caused them.

Worth stating plainly because the raw count of 15 overstates the tool problem: only 2 are
the failure this project addresses.

#### Gap no rule could close — now fixed at the source

`1:1 — Nick & Scott (Scott runs)` had attendees `[scott@firecoldplunge.com,
info@plungezero.com]` — **Nick was not on his own 1:1** — and the `1:1 — Nick & Tosha`
series was the same from Aug 6 onward. No matching rule can infer attendance that no
calendar field records, and title-matching on "Nick" would be far too fragile to trust.

Fixed on 2026-07-26 by adding `hello@firecoldplunge.com` as an attendee to both recurring
masters on `info@plungezero.com`:

| Series | Master ID |
|---|---|
| `1:1 — Nick & Scott (Scott runs)` | `5ovnprsoburgdjdbom97cc8qvd` |
| `1:1 — Nick & Tosha` | `2c9qc2bum6fplso965tdqp6ub2` |

Additive only — no attendee removed — and written with `notificationLevel: NONE` so Scott
and Tosha were not re-invited. Verified across all 16 future instances, including two that
had been individually edited and therefore might not have inherited; they did.

#### Indeed events may be stale, and calguard will mirror them anyway

The Indeed interview placeholders are written into `hello@firecoldplunge.com` by Indeed,
but the authoritative schedule lives in Indeed, not Google. Nick reports that a pair the
calendar shows as overlapping (Jul 27 12:00 Hicham Jorio vs the Rhynan Fay dealer intro)
does not actually conflict, while both Google events remain `confirmed` at those times.

The likely explanation is that a change made in Indeed did not propagate to the Google
copy. Consequence for calguard: it will faithfully mirror a stale placeholder as real busy
time and block slots that are genuinely free. Nothing in the matching rules can detect
this — the event looks completely normal. Worth watching in the first `--apply` runs, and
a reason to keep the Indeed→Google sync honest.

### Currently degraded

`nick@faceplungecompany.com` is `freeBusyReader`, so calguard can neither read its detail
nor write holds to it — the same wall the booking tools hit. It will report the calendar
as BLOCKED until Part A step 1 lands. Everything else still works meanwhile.

Also still outstanding: `GCAL_CLIENT_ID` / `GCAL_CLIENT_SECRET` / `GCAL_REFRESH_TOKEN`
need to be issued for `hello@firecoldplunge.com` with the
`https://www.googleapis.com/auth/calendar` scope. The `GSC_*` token will not work — its
grant excludes Calendar.
