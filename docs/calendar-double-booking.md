# Calendly double-booking — diagnosis

Analysis window: 2026-06-20 → 2026-08-10. Data pulled live from the Google Calendar API
as `hello@firecoldplunge.com`.

## Calendars in play

| Calendar | Access from `hello@` | Role |
|---|---|---|
| `nick@plungezero.com` | `owner` | Nick's PZ calendar |
| `info@plungezero.com` | `owner` | Associate / shared PZ ops calendar |
| `hello@firecoldplunge.com` | `owner` | **Shared FCP company calendar** (not Nick's personal) |
| `nick@faceplungecompany.com` | **`freeBusyReader`** | Nick's FacePlunge calendar — details hidden |

## Confirmed mechanisms

### 1. Nick is a guest, not a host, on the associate's Calendly
All 13 associate-booked meetings in the window have `organizer: info@plungezero.com`
with Nick as a plain attendee. Calendly only checks availability for **hosts and
co-hosts** — guests added to a booking are never checked. So the associate's Calendly
consults her own calendar, finds it free, books, then attaches Nick.

Nick's availability is never consulted. This is the reported complaint, and it is
structurally live regardless of how often it has visibly fired.

### 2. `nick@faceplungecompany.com` is shared at free/busy only
The API returns `accessRole: freeBusyReader`. Calendly's guidance is that a shared
calendar must be shared with read/write ("Make changes to events") to be usable for
conflict checking. Free/busy-only is not enough.

This is also a hard blind spot for *any* audit: only 3 instances of one recurring block
were visible across seven weeks. The true collision count against this calendar cannot
be measured until access is upgraded.

### 3. There is no busy mirroring between the calendars
Verified: not one busy-hold is copied between calendars. What exists is `hello@` being
able to *see* the others in one view — which reads as "connected" in the UI and does
nothing for any booking tool.

### 4. Nick does not RSVP
22 of 34 events on `nick@plungezero.com` sit at `needsAction`. Google treats an
un-RSVP'd invite as *tentative*. Calendly's default free/busy rules block
Busy / Working Elsewhere / Away — **tentative is a separate, off-by-default toggle.**

### 5. Five independent availability sources write to Nick's time
Calendly(`info@`) 13 bookings · Calendly(`nick@pz`) 2 · HubSpot Meetings
(`scott@plungezero`, `scott@firecoldplunge`) 5 · plus Huzzle, SureBright, 52Launch,
Priority1 booking direct. No single Calendly setting governs the non-Calendly ones.

## Measured damage — and a correction

Restricting overlap detection to meetings Nick is genuinely a participant in
(organizer, creator, or attendee), the window contains **one** confirmed collision:

> **Tue Jun 30** — HubSpot booked "30 min with Scott (Fernando Calle)" 14:00–14:30 onto
> `nick@plungezero.com`, on top of ARAURIS Founders 11:00–19:00, which lives on
> `nick@faceplungecompany.com`.

That is the free/busy-only calendar. The one collision we can prove points squarely at
the one calendar tools cannot read.

An earlier pass counted 7 collisions. That was wrong: it treated
`hello@firecoldplunge.com` as Nick's personal calendar. It is not — its "Deep Work"
blocks are Scott's, its recruiting events carry no attendees, and its team meetings
(Customer Service Weekly, Quarterly Inventory) do not include Nick. The only `hello@`
events Nick attends are the 5 ARAURIS blocks, and those are organized by
`nick@faceplungecompany.com`.

**Consequence for any fix:** mirroring `hello@` busy time onto Nick's calendars would be
actively harmful — Jul 27 alone carries 10 `hello@` events, which would blanket Nick's
bookable availability with other people's meetings.

## Fix — Part A (settings; must be done in the UI)

Calendly's public API cannot change calendar-sync settings or convert event types, so
this is click-work.

1. **Google Calendar — re-share `nick@faceplungecompany.com`** to whichever Google
   account each Calendly user is connected to, with **"Make changes to events"**, not
   "See only free/busy". Highest-leverage single change; without it nothing else can see
   the calendar that caused the one proven collision.
2. **Calendly → Availability → Calendar settings**, for *every* Calendly user (`info@`,
   `nick@pz`, Nick's own): add `nick@plungezero.com` **and**
   `nick@faceplungecompany.com` to **"Check for conflicts."** This is a manual
   per-sub-calendar checkbox list; it is not automatic.
   *Plan note:* Calendly free allows 1 calendar connection. Standard and above allow 6.
3. **Convert "Plunge Zero Dealer Intro" to a Collective event type with Nick as
   co-host.** This is what makes the associate's bookings check Nick before offering a
   slot. Adding him as a guest never will.
4. **Calendly → free/busy rules: enable Tentative**, so the 22 un-RSVP'd invites block.
   (Or Nick starts accepting invites — either works, the toggle is more reliable.)
5. **HubSpot:** point Scott's meeting links at a group/round-robin meeting that includes
   Nick, or stop auto-adding him. HubSpot checks Scott's calendar only, and no Calendly
   setting reaches it. This is what caused the Jun 30 collision.

Do not skip 1 before 2 — step 2 cannot succeed while the calendar is free/busy-only.

## Fix — Part B (enforcement, scoped)

A mirror job is still worth building, because Part A depends on every person configuring
every future tool correctly. But it must mirror **only events where Nick is a genuine
participant** (organizer, creator, or attendee matching `nick@plungezero.com`,
`nick@faceplungecompany.com`, `ncreed11@gmail.com`) — never a whole shared calendar.

Design constraints, per `CLAUDE.md`:
- Idempotent: holds keyed by source event ID in `extendedProperties.private`, so
  re-running updates rather than duplicates (rule 3).
- State in `state/` (rule 2).
- Dry-run by default (rule 1 posture).
- Skips `transparency: transparent` events, so the Ideal Week time-blocks stay bookable.
- Skips events Nick declined, and all-day birthdays.
- Hold titles carry no detail — just `Busy (auto)` — so nothing leaks between brands.

Blocked on: step 1 above. The job cannot read `nick@faceplungecompany.com` at
`freeBusyReader` either, which is the same wall the booking tools hit.
