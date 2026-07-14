# P187 Controlled Production Lifecycle Cutover — Stage 1 Canary

## Transition

`Hiring Recommendation→Operator Approved`

**P186 owner (canary):** p187-hr-to-oa-canary→p186-lifecycle-control-plane→candidate-workflow-store-core

**Legacy owner:** p97-approval-mode-persist / api-candidates-workflows

## Scope
- P186 becomes authoritative ONLY for Hiring Recommendation → Operator Approved
- Immutable cohort ≤ 5 with explicit operator authorization
- Stop on first failure with automatic rollback availability
- Reconciliation of legacy vs P186 outcomes
- Executive cutover status dashboard (read-only unless flagged)

## Out of scope
- All other lifecycle transitions remain on legacy/prior owners
- Paperwork send (P184/P185 unchanged)
- Dropbox Sign envelope mutations
- MEL export
- Continuous automation / scheduler changes
- Advancement beyond Operator Approved

## Safety walls
- No paperwork sends
- No Dropbox Sign changes
- No MEL exports
- No advancement past Operator Approved
- No continuous automation
- No scheduler changes
- Production canary execute flag default OFF
- Do not execute production canary without explicit operator approval

## Execution policy

P187 implements and validates the canary framework only. Production execution requires P187_EXECUTE_PRODUCTION_CANARY + allowProductionExecution + operator authorization. Default path refuses live execution.

Max cohort: **5**. Immutable. Stop on first failure.
