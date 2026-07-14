# P187 Test Summary

Suite: `src/lib/p187-hr-to-oa-canary/__tests__/p187-hr-to-oa-canary.test.ts`

Coverage includes:
- flags default off / no global authority
- single-transition authority (HR→OA only)
- immutable cohort max 5 + expansion refusal
- operator authorization + fingerprint binding
- dry-run success path
- stop-on-first-failure
- production execute refused by default
- reconciliation (mismatch/duplicate/skip/invalid/audit)
- rollback safety (audit preserve, no data loss, no duplicates)
- dashboard fields + architecture scope
- no P184/P185/MEL/scheduler imports

Run: `node --import tsx --test src/lib/p187-hr-to-oa-canary/__tests__/p187-hr-to-oa-canary.test.ts`
