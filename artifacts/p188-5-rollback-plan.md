# P188.5 Rollback Plan

Cohort: `p188.5-canary-c5c917a526`
Fingerprint: `acbfbd53412fe35160ea41d5`

## Status

Do **not** automatically roll back on success.
Prepared for the 10 successfully restored assignment(s).

## Rollback rules

- Restore previous recruiter value (Unassigned for this canary)
- Append a rollback ledger event with source referencing the canary correlation
- Preserve audit / ownership ledger history (append-only)
- Do not change lifecycle state, paperwork, recommendations, approvals, MEL, or P187
- Idempotent: re-running rollback when already Unassigned is a no-op success

## Per-candidate rollback package

### 1b3a…b63c
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-b0438b88-b1ee-4d52-8e13-a903df005aeb
- rollbackReference: see frozen cohort member

### 5da2…1b96
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-66fcb6a7-e564-42b8-b16c-3755eb10c4eb
- rollbackReference: see frozen cohort member

### 2726…a5b9
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-a1e4cd47-9cc5-4742-8b72-6f08d3f6fb9c
- rollbackReference: see frozen cohort member

### f700…0f03
- previous: Unassigned
- current: Logan
- ledgerEventId: own-ed38f4cd-c717-45f4-aab8-f10396cf7e69
- rollbackReference: see frozen cohort member

### 570d…132e
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-fc77f4d0-0684-4215-b111-29a258a97e34
- rollbackReference: see frozen cohort member

### 1b90…99ec
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-f71eb001-1ca1-4352-8c3a-1a0eb144c358
- rollbackReference: see frozen cohort member

### 520a…6673
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-db86ff3e-f4f7-4d15-949b-3b9b2c753005
- rollbackReference: see frozen cohort member

### de92…199b
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-48f4ef92-9c0f-430a-a66f-fcfea0e9819e
- rollbackReference: see frozen cohort member

### 9684…4533
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-267de172-e503-4b03-9858-29b66b464a50
- rollbackReference: see frozen cohort member

### 9111…89ae
- previous: Unassigned
- current: Taylor
- ledgerEventId: own-74e9eb54-4c12-4ed2-a73c-08321b9dc64f
- rollbackReference: see frozen cohort member


## Suggested gated command (not executed)

```bash
P188_OWNERSHIP_RESTORE_EXECUTION=true npx tsx scripts/p188-5-rollback-canary.ts \
  --cohort p188.5-canary-c5c917a526 \
  --token "$OPERATOR_TOKEN" \
  --allow-production-writes
```

## Safety

Stop if any candidate outside the frozen cohort is targeted.
