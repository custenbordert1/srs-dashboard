# P155 — Autopilot Operations Dashboard

Generated: 2026-07-07T15:33:54.841Z

## Autopilot Status

- Enabled: false
- Continuous: false
- Runner: disabled
- Last run: 2026-07-07T15:10:21.366Z
- Next run: 2026-07-07T15:20:46.364Z
- Interval: 10 min
- Send cap / cycle: 10
- Assignment cap / cycle: 25

## Today's Activity

- Evaluated: 546
- Assigned: 0
- Sent: 10
- Signed: 0
- Active signatures: 71
- Duplicates prevented: 26
- Failures: 0

## Queue Health

- Eligible: 53
- Waiting on signature: 16
- Signed today: 0
- Invalid email: 0
- Duplicates: 26
- Manual review: 0
- Disqualified/archived: 2
- Queue remaining: 56

## Recent Sends

- **James Peters** (retailservicespjm@gmail.com) — Alex / Trista Thomas — sent — 2026-07-07T14:02:02.203Z
- **Jackie Smart** (jacks0427@yahoo.com) — Morgan / Trista Thomas — sent — 2026-07-07T14:02:01.432Z
- **Irbania marmol** (irbaniam2704@hotmail.com) — Taylor / Mindie Rodriguez — sent — 2026-07-07T14:02:00.616Z
- **Harryl Avery Jr** (harrylaveryjr.hr@gmail.com) — Alex / Trista Thomas — sent — 2026-07-07T14:01:59.919Z
- **Gregory Petties** (shreddedsteel49@gmail.com) — Logan / Lori VandeWiele — sent — 2026-07-07T14:01:59.238Z
- **Getsemani** (cgetse24@gmail.com) — Logan / Lori VandeWiele — sent — 2026-07-07T14:01:58.494Z
- **Garrett Exum** (exuron1@gmail.com) — Casey / Erin Boatright — sent — 2026-07-07T14:01:57.802Z
- **Francis Petitte** (petittef@outlook.com) — Morgan / Trista Thomas — sent — 2026-07-07T14:01:56.994Z
- **Felicia Lewis** (feliciastacker95@gmail.com) — Alex / Trista Thomas — sent — 2026-07-07T14:01:56.263Z
- **Faith Withem** (faith.withem@gmail.com) — Morgan / Trista Thomas — sent — 2026-07-07T14:01:55.077Z

## Exceptions

- [duplicate_conflict] Bhavin Patel — Onboarding record already has an active signature request.
- [duplicate_conflict] Billy Joe Romero — Onboarding record already has an active signature request.
- [duplicate_conflict] Garrett Exum — Onboarding record already has an active signature request.
- [duplicate_conflict] Ryley Umbel — Onboarding record already has an active signature request.
- [duplicate_conflict] Chirumamilla Praneetha — Onboarding record already has an active signature request.
- [duplicate_conflict] James Peters — Onboarding record already has an active signature request.
- [duplicate_conflict] Dezire Nelson — Onboarding record already has an active signature request.
- [duplicate_conflict] Gregory Petties — Duplicate candidate flagged.
- [duplicate_conflict] Faith Withem — Duplicate candidate flagged.
- [duplicate_conflict] Edward Rak — Onboarding record already has an active signature request.
- [duplicate_conflict] Irbania marmol — Duplicate candidate flagged.
- [duplicate_conflict] Antwon Scott — Onboarding record already has an active signature request.

## Controls

Executive-only POST `/api/recruiting/autopilot/control` supports dry_cycle, live_cycle (confirmLive + env), pause, resume, refresh.
Continuous daemon is **not** startable from this UI.
