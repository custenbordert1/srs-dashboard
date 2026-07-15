# P204.2 — Controlled Recommendation Approval Pilot

Generated: 2026-07-15T20:03:43.477Z

## Cohort

| Item | Value |
|---|---|
| Cohort ID | `p204-1-807bd648` |
| Fingerprint | `c18a84f889e6bb453c30b0d0` |
| Candidates reviewed | **20** |
| Stale excluded | 0 |

## Operator decisions

| Metric | Value |
|---|---|
| Exact agreement | 19 (95%) |
| Overrides | 1 (5%) |
| Defer | 0 |
| Stale | 0 |
| AI too aggressive | 1 |
| AI too conservative | 0 |

## Agreement by recommendation type

- Reject: 5/5 (100%)
- Needs Recruiter Review: 5/5 (100%)
- Advance: 9/10 (90%)

## Top override reasons

- (1) Territory/nearby-job signal may over-influence or conflict with explanation.

## Safety exceptions

- 50d84b0ff17c: explanation_conflicts_with_zero_distance_signal

## Future lifecycle pilot forecast (only)

| Bucket | Count |
|---|---|
| Approved Advance | 9 |
| Approved Needs Review | 5 |
| Approved Reject | 5 |
| Deferred | 0 |
| Stale | 0 |
| Blocked by evidence | 1 |

## Production writes

| Write | Count |
|---|---|
| Operator decisions persisted | 20 (new this run: 0, idempotent: 20) |
| Lifecycle drift | **0** |
| Paperwork Needed created | **0** |
| Rejection status writes | **0** |
| Dropbox / MEL / automation | **0 / 0 / 0** |

## Calibration

- Thresholds unchanged: **true**
- Recommendation: keep_thresholds
- Override volume does not justify changing thresholds in this phase.
- Thresholds remain unchanged in P204.2.

## Final recommendation

**ready for controlled lifecycle action pilot**
