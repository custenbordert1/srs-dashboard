# P188.7 Rollback Plan

Cohort: `p188.7-batch-9fe997d49a`
Fingerprint: `e0fc04edb0a3934879101379`

## Status

Do **not** automatically roll back on success.
Prepared for 50 successfully restored assignment(s) in this batch.

## Rules

- Restore previous recruiter (`Unassigned` for this batch)
- Append rollback ledger event
- Preserve append-only audit/ledger history
- Do not change lifecycle, paperwork, recommendations, approvals, MEL, or P187
- Idempotent when already Unassigned
- Do not touch P188.5/P188.6 restored assignments

## Safety

Only members of frozen cohort `p188.7-batch-9fe997d49a`.
