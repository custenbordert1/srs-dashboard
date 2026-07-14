# P188.6 Rollback Plan

Cohort: `p188.6-batch-30436ad77c`
Fingerprint: `cc847fd13b0a3d65561cca82`

## Status

Do **not** automatically roll back on success.
Prepared for 50 successfully restored assignment(s) in this batch.

## Rules

- Restore previous recruiter value (`Unassigned` for this batch)
- Append rollback ledger event
- Preserve append-only audit/ledger history
- Do not change lifecycle, paperwork, recommendations, approvals, MEL, or P187
- Idempotent when already Unassigned

## Safety

Only members of frozen cohort `p188.6-batch-30436ad77c`.
Prior P188.5 canary assignments must remain untouched by this rollback.
