# P255 — Recover Remaining Eligible Candidates

- Generated: 2026-07-23T17:41:56.748Z
- Ops date: 2026-07-23
- Mode: **recovery_apply** (persist=true)
- Source: `artifacts/p254-eligibility-forensics.json`

## Totals

| Metric | Count |
| --- | ---: |
| Targeted (P254 auto-recoverable) | 3 |
| Repaired | 3 |
| Now eligible | 2 |
| Still blocked | 1 |
| Field changes applied | 8 |

## Safety

| Guard | Value |
| --- | --- |
| Paperwork sends | 0 |
| Dropbox writes | 0 |
| Breezy writes | 0 |
| MEL writes | 0 |
| Workflow writes | 1 |
| Ingestion writes | 2 |

## Candidate outcomes

### DeAnn Echols-Parker (`bee316e7dd26`)

- Email: deannparker88@gmail.com
- Status: **STILL BLOCKED**
- Repaired: yes
- Eligibility: `coverage_blocked` → `distance_blocked`
- Blockers before: `missing_phone`, `coverage_blocked`
- Blockers after: `manual_review_40_60`, `distance_blocked`
- Still blocked reasons: `manual_review_40_60`, `distance_blocked`
- Coverage after: known=true nearestMiles=57.6

| Field | Before | After | Source | Applied | Reason |
| --- | --- | --- | --- | --- | --- |
| `phone` | (empty) | +1 870 260 6572 | `breezy` | yes | Backfilled usable phone (durable was empty at P254) |
| `city` | (empty) | Caddo Valley | `p226_recovery_store` | yes | Backfilled city for coverage geocode (empty at P254) |
| `state` | (empty) | AR | `p226_recovery_store` | yes | Backfilled state for coverage geocode (empty at P254) |

Notes:
- Breezy live hit via position 8561a483ff19

### Sadio Mustafa (`c9f5bb769a06`)

- Email: kaibusinessminded@gmail.com
- Status: **NOW ELIGIBLE**
- Repaired: yes
- Eligibility: `coverage_blocked` → `eligible_pending_send`
- Blockers before: `missing_phone`, `coverage_blocked`
- Blockers after: none
- Coverage after: known=true nearestMiles=5.9

| Field | Before | After | Source | Applied | Reason |
| --- | --- | --- | --- | --- | --- |
| `phone` | (empty) | +1 501 272 9601 | `breezy` | yes | Backfilled usable phone (durable was empty at P254) |
| `city` | (empty) | N Little Rock | `p226_recovery_store` | yes | Backfilled city for coverage geocode (empty at P254) |
| `state` | (empty) | AR | `p226_recovery_store` | yes | Backfilled state for coverage geocode (empty at P254) |

Notes:
- Breezy live hit via position cfd52392ca92

### melissa lloyd (`cbbd99a1d55e`)

- Email: melissalloyd501@gmail.com
- Status: **NOW ELIGIBLE**
- Repaired: yes
- Eligibility: `missing_recruiter` → `eligible_pending_send`
- Blockers before: `missing_recruiter`, `missing_dm`
- Blockers after: none
- Coverage after: known=true nearestMiles=0

| Field | Before | After | Source | Applied | Reason |
| --- | --- | --- | --- | --- | --- |
| `assignedRecruiter` | Unassigned | Taylor | `workflow_db` | yes | Assigned Taylor when recruiter was Unassigned |
| `assignedDM` | Unassigned | Erin Boatright | `p216_position_location_territory_routing` | yes | Assigned DM from position location territory routing |

Notes:
- Breezy live hit via position b4ee901bfd73
- DM resolved via P216: Erin Boatright (state=FL, city=BABCOCK RANCH)

## Run notes

- Loaded 3 auto-recoverable candidate(s) from artifacts/p254-eligibility-forensics.json
- Published Breezy jobs loaded=274
- Opportunity geocode points=259

## Artifacts

- `artifacts/p255-recovery-report.json`
- `artifacts/p255-recovery-report.md`

