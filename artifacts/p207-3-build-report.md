# P207.3 — Build Report

Generated: 2026-07-16T15:25:00.000Z

## Command

`npm run build`

## Initial blocker inventory (non-test / production typecheck)

| # | File | Line | Error |
| --- | --- | ---: | --- |
| 1 | `src/lib/p201-3-controlled-paperwork-needed-pilot/gates.ts` | 188 | Invalid cast `ScoredCandidateWorkflowRow` → `{ nearbyJobsCount: number }` |
| 2 | `src/lib/p201-3-controlled-paperwork-needed-pilot/gates.ts` | 190 | Invalid cast → `{ nearbyJobs: unknown[] }` |
| 3 | `src/lib/p201-3-controlled-paperwork-needed-pilot/select.ts` | 100 | `row.position` does not exist (use `positionName`) |
| 4 | `src/lib/p204-1-supervised-qualification-pilot/select.ts` | 99 | `job: null` not assignable (`undefined` required) |
| 5 | `src/lib/p204-ai-candidate-qualification/simulate.ts` | 53 | `job: null` not assignable |
| 6 | `src/lib/p204-2-controlled-recommendation-approval/execute.ts` | 192 | `overrideReason: string \| null` into metadata union |
| 7 | `src/lib/p205-controlled-lifecycle-action-pilot/execute.ts` | 330 | `reasonCodes: string[]` into metadata union |
| 8 | `src/lib/p205-controlled-lifecycle-action-pilot/execute.ts` | 425 | `recruiterChanged: boolean` vs literal `false` |
| 9 | `src/lib/p205-controlled-lifecycle-action-pilot/execute.ts` | 473 | `recruiterReassignments: number` vs literal `0` |
| 10 | `src/lib/p205-controlled-lifecycle-action-pilot/gates.ts` | 125 | Compare `paperworkStatus` to `"completed"` (not in union) |
| 11 | `src/lib/p206-supervised-paperwork-send-pilot/preflight.ts` | 293 | `status.running` missing on `P192RunnerStatus` |
| 12 | `src/lib/p206-supervised-paperwork-send-pilot/select.ts` | 113 | Redundant `"Paperwork Needed"` comparison after narrowing |

**Total unique build blockers fixed: 12**

## Fixes (minimal, behavior-preserving)

1–2. Intersect optional `nearbyJobsCount` / `nearbyJobs` on row extras (no `unknown` cast chain).
3. `row.positionName` instead of nonexistent `row.position`.
4–5. `job: undefined` instead of `job: null`.
6. `overrideReason: record.overrideReason ?? ""`.
7. `reasonCodes: member.reasonCodes.join(",")`.
8–9. Widen P205 result types `recruiterChanged` / `recruiterReassignments` to `boolean` / `number` (runtime reporting unchanged).
10. Legacy `"completed"` checked via `String(paperworkStatus)` without widening `PaperworkStatus`.
11. Idle detection via `phase` set (`starting|preflight|dry_run_validation|running`).
12. Paperwork Needed gate via `Set.has(status)` to avoid duplicate-literal narrowing.

## Final build result

- ✓ Compiled successfully
- ✓ Typecheck passed
- ✓ Generating static pages (4/4)
- ✓ Routes include `/api/recruiting/p207-autonomous-readiness`, `/executive`, `/dm`
- Remaining blockers: **none**
