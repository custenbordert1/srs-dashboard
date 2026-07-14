# P187.1 Operator Authorization Package

**Do not fabricate operator approval. Do not set flags in this phase.**

- **Canary ID:** `p187-1-PENDING-NO-COHORT`
- **Cohort fingerprint:** `pending-no-cohort`
- **Transition scope:** Hiring Recommendation→Operator Approved
- **Max cohort:** 5
- **Actor:** (pending operator)
- **Authorization timestamp:** (pending)
- **Expiration window:** 4 hours after authorization
- **Production commit:** `81039fba0bc58d1545dc8cd1c76073392785e2fe`
- **Expected candidate count:** 0

## Stop conditions
- First candidate failure
- Any mismatch vs OPERATOR_APPROVED
- Any invalid advancement beyond Operator Approved
- Any paperwork/MEL/Dropbox activity
- Authorization expired
- Cohort fingerprint mismatch
- Competing writer collision

## Rollback control

rollbackP187Canary({ plan, results, forceFlags: { rollback: true }, executeRestore: true }) after enabling P187_ROLLBACK only for the rollback window

## Required feature flags (later — still OFF now)
- `P187_CANARY_FRAMEWORK=1`
- `P187_TRANSITION_AUTHORITY_HR_TO_OA=1`
- `P187_RECONCILIATION=1`
- `P187_ROLLBACK=1`
- `P187_EXECUTE_PRODUCTION_CANARY=1`

- Required runtime argument: `allowProductionExecution=true`
- Dashboard flag optional: **true** (`P187_CANARY_DASHBOARD`)
- Scope flags to production only: **true**
- Authority must expire after canary: **true**

## Future execution sequence (do not run now)
1. verify gates
2. confirm cohort fingerprint
3. record authorization
4. contain competing writer for this transition
5. enable scoped authority
6. enable canary execution
7. process one candidate at a time
8. verify production write
9. verify P186 observation
10. verify audit
11. stop on first failure
12. rollback if needed
13. disable authority/execution flags
14. restore legacy writer if contained
15. reconcile all cohort members
16. confirm no other transition changed

fabricatedApproval: **false** · flagsSet: **false** · operatorApprovalRecorded: **false**
