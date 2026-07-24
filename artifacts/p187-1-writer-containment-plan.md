# P187.1 Writer Containment Plan

Transition: `Hiring Recommendation→Operator Approved`

**Nothing is disabled in P187.1.** This is an execution-time plan only.

## Writers

- **Legacy:** p97-approval-mode-persist / api-candidates-workflows
- **P187:** p187-hr-to-oa-canary→p186-lifecycle-control-plane→candidate-workflow-store-core

### Competing writers
- api-candidates-workflows (manual Operator Approved / approval paths)
- p97-approval-mode-persist
- p186-3 executeOperatorApprovalAction approve_hiring_recommendation (advances to Paperwork Needed — out of canary scope)
- p83-candidate-advancement / p151-pipeline-advancement (if they mutate approval)

### Scheduler / API overlaps
- P154.7 / P169 continuous orchestrators (must remain disabled)
- Manual executive approval UI during canary window
- Bulk approval APIs overlapping the same candidate IDs

### Temporary containment (execution only)
- During execution only: pause/hold competing approval writers for THIS transition + THIS cohort fingerprint
- Do not freeze P184/P185
- Do not change Operator Approved→Paperwork Needed ownership
- Block parallel approve_hiring_recommendation that would skip to Paperwork Needed for cohort members
- Short maintenance note on operator queues for canary IDs only

## Rollback re-enable

Clear P187_TRANSITION_AUTHORITY_HR_TO_OA + P187_EXECUTE_PRODUCTION_CANARY; restore legacy approval writer access for transition; keep audit; do not resend paperwork

disabledNow: **false**
