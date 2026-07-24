# P193 Simplified Autonomous Recruiting Lifecycle

## Objective

Replace complex recruiting lifecycle UI/ops with a single business pipeline:

```
Applicant → AI Review → Paperwork → Monitor → Signed → Ready for Assignment
```

## Primary states

| State | Meaning |
|---|---|
| Applied | New applicant captured |
| AI Reviewing | Unified qualification in progress |
| Qualified | AI approved — eligible for paperwork bridge |
| Paperwork Sent | Envelope created (P184/P192) |
| Awaiting Signature | Sent/viewed, unsigned |
| Signed | Required docs complete |
| Ready For Assignment | Prepared for human assignment (no MEL) |
| Needs Human Review | Exception path |
| Rejected / Hold / Expired | Side paths |

## Metadata (not states)

Questionnaire/resume scores, experience, distance, nearby jobs, verification flags, paperwork status, reminder count/timestamps, confidence, lat/long, available projects. Recommend-hire / operator-approval / recruiter assignment become **optional audit fields**.

## Adapters (do not modify cores)

| Adapter | Role |
|---|---|
| `migrationAdapter` | Map P186–P192 / workflow statuses → P193 |
| `paperworkBridge` | Project Qualified → legacy `Paperwork Needed` + evidence markers so **unchanged P192** can send |
| `signatureAdapter` | Map Dropbox events → P193 paperwork metadata/states |
| `reminderEngine` | 1h / 24h / 48h / 7d expire plans (send gated) |
| `readyForAssignment` | Signed → Ready; populate geo/jobs; **no MEL** |

## Client / server boundary (P193.1)

| Layer | Path | May import fs? |
|---|---|---|
| Shared / client-safe | `types`, `constants`, `client-projection`, `recordFactory`, `stateMachine`, `migrationAdapter`, `dashboard`, … | **No** |
| Server-only | `server/store.ts`, `server/load-candidate.ts`, `server/index.ts` (`import "server-only"`) | Via persistence |
| Persistence | `server/persistence.ts` | Yes — never from Client Components |

Client Components import `client-projection` only. Route Handlers import `server`.

## Dashboard cards

New Applicants · AI Reviewing · Qualified · Paperwork Pending · Viewed · Signed · Ready For Assignment · Needs Human Review · Expired

Each: count, age, next action.
