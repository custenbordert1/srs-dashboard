# P179 — Operator Controlled Send Gate Profile

Generated: 2026-07-09T16:41:31.161Z
Mode: read-only validation (no sends, no automation enablement)

## Gate profile summary

| Profile | Pass | Blocking | Warnings |
| --- | --- | ---: | ---: |
| **operator** | yes | 0 | 4 |
| **autonomous** | no | 4 | 0 |

## Send readiness (P178 cohort)

- Paperwork-ready candidates: **21**
- Operator gate profile pass: **yes**
- Operator batch send allowed: **no**
- Autonomous send allowed: **no**
- Max sends within Dropbox budget: **17**
- Projected send count (operator): **21**
- Projected Dropbox API calls: **42** (within budget: no)

## Operator warnings (informational only)

- Production readiness score 70 is below 80
- P154 controlled production autopilot env gate is not enabled
- Scheduler recommends WAIT_10_MINUTES
- Executive approval recommendation is WAIT

## Autonomous blockers

- Production readiness score 70 is below 80
- P154 controlled production autopilot env gate is not enabled
- Scheduler recommends WAIT_10_MINUTES
- Executive approval recommendation is WAIT

## Operator hard blockers

- None

## Candidates

| Name | P157 | P152 | Operator | Autonomous |
| --- | --- | --- | --- | --- |
| David Karp | Send Paperwork | yes | allowed | blocked |
| april white | Send Paperwork | yes | allowed | blocked |
| Gregory Petties | Send Paperwork | yes | allowed | blocked |
| Liaunda Lang | Send Paperwork | yes | allowed | blocked |
| Mista Clark | Send Paperwork | yes | allowed | blocked |
| Norah Jones | Send Paperwork | yes | allowed | blocked |
| Jasmine Barber | Send Paperwork | yes | allowed | blocked |
| Terry Bryant | Send Paperwork | yes | allowed | blocked |
| Patrick Berry | Send Paperwork | yes | allowed | blocked |
| Lindsey Aaron | Send Paperwork | yes | allowed | blocked |
| Gianna DelGarbino | Send Paperwork | yes | allowed | blocked |
| Nykol Tindle | Send Paperwork | yes | allowed | blocked |
| Patricia Irby | Send Paperwork | yes | allowed | blocked |
| Darryl T. Williams | Candidate Duplicate | no | blocked | blocked |
| Karen Burkes | Send Paperwork | yes | allowed | blocked |
| Gabriella Gandy | Send Paperwork | yes | allowed | blocked |
| Latrese Crump | Assign Recruiter | no | blocked | blocked |
| Monique Franklin | Send Paperwork | yes | allowed | blocked |
| Lovett Roberts | Send Paperwork | yes | allowed | blocked |
| Tasha Early | Send Paperwork | yes | allowed | blocked |
| Rebekah Hoover | Send Paperwork | yes | allowed | blocked |
| DEAN B. SERGIACOMI | Send Paperwork | yes | allowed | blocked |
| William Gustafson | Send Paperwork | yes | allowed | blocked |
| June Ann Stagen | Candidate Duplicate | no | blocked | blocked |
| Taylor Custenborder | Candidate Duplicate | no | blocked | blocked |

## Safety

- Read-only validation — no paperwork sends
- No Breezy or Dropbox writes
- No automation enabled, no daemon started
- Operator profile: readiness/scheduler/executive factors are warnings only
- Autonomous profile: all production gates remain strict
