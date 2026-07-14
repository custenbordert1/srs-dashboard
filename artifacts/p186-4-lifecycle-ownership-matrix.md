# P186.4 Lifecycle Ownership Matrix

Generated: 2026-07-13T14:22:50.218Z

Production remains the system of record. This matrix is shadow guidance only.

| Transition | Ownership | Writers | Recommended owner |
|---|---|---|---|
| Applied→Needs Review | multiple | p151-pipeline-advancement, p186-3-operator-approval-actions, candidate-ingestion-backfill | p151-pipeline-advancement |
| Needs Review→Qualified | multiple | p83-candidate-advancement, p97-approval-mode-persist, p151-pipeline-advancement, p186-3-operator-approval-actions, candidate-ingestion-backfill | p151-pipeline-advancement |
| Qualified→Paperwork Needed | multiple | p83-candidate-advancement, p97-approval-mode-persist, p106-autonomous-paperwork-engine, p1061-autonomous-paperwork-runner, p122-controlled-live-pilot, p123-paperwork-cycle-orchestrator, p125-production-runner, p136-paperwork-scheduler, p151-pipeline-advancement, p152-immediate-paperwork, p158-post-assignment-transition, p184-autonomous-paperwork-send-engine, p185-production-paperwork-runner, p186-3-operator-approval-actions, onboarding-send-execute, onboarding-send-queue-worker, p84-autonomous-paperwork-send, candidate-onboarding-engine, candidate-ingestion-backfill, hiring-automation-engine, p182-scoped-operator-live-send, p183-final-scoped-operator-send | p185-production-paperwork-runner |
| Paperwork Needed→Paperwork Sent | multiple | p83-candidate-advancement, p97-approval-mode-persist, p106-autonomous-paperwork-engine, p1061-autonomous-paperwork-runner, p107-paperwork-monitor, p122-controlled-live-pilot, p123-paperwork-cycle-orchestrator, p125-production-runner, p136-paperwork-scheduler, p151-pipeline-advancement, p152-immediate-paperwork, p158-post-assignment-transition, p184-autonomous-paperwork-send-engine, p185-production-paperwork-runner, p186-3-operator-approval-actions, dropbox-sign-webhook, onboarding-send-execute, onboarding-send-queue-worker, p84-autonomous-paperwork-send, candidate-onboarding-engine, workflow-onboarding-reconciliation, candidate-ingestion-backfill, hiring-automation-engine, p182-scoped-operator-live-send, p183-final-scoped-operator-send | p185-production-paperwork-runner |
| Paperwork Sent→viewed | multiple | p106-autonomous-paperwork-engine, p107-paperwork-monitor, p122-controlled-live-pilot, p152-immediate-paperwork, dropbox-sign-webhook, onboarding-send-execute, p84-autonomous-paperwork-send, workflow-onboarding-reconciliation, hiring-automation-engine, p183-final-scoped-operator-send | onboarding-send-execute |
| viewed→Signed | multiple | p107-paperwork-monitor, dropbox-sign-webhook, p84-autonomous-paperwork-send, candidate-onboarding-engine, workflow-onboarding-reconciliation, hiring-automation-engine, direct-deposit-workflow | dropbox-sign-webhook |
| Signed→Awaiting DD Verification | multiple | p107-paperwork-monitor, dropbox-sign-webhook, candidate-onboarding-engine, workflow-onboarding-reconciliation, direct-deposit-workflow | dropbox-sign-webhook |
| Signed→Ready for MEL | multiple | p107-paperwork-monitor, p186-3-operator-approval-actions, dropbox-sign-webhook, p84-autonomous-paperwork-send, candidate-onboarding-engine, workflow-onboarding-reconciliation, hiring-automation-engine | dropbox-sign-webhook |
| Ready for MEL→Loaded in MEL | multiple | p107-paperwork-monitor, p186-3-operator-approval-actions, p84-autonomous-paperwork-send, candidate-onboarding-engine, workflow-onboarding-reconciliation, hiring-automation-engine | p107-paperwork-monitor |

## Conflict groups

- `paperwork_send` — prefer P185→P184→onboarding send queue
- `approval_to_paperwork_needed` — prefer gated operator/API path via workflow store
- `signature_to_mel` — prefer Dropbox webhook + P107 monitor
- `continuous_orchestration` — prefer single future control plane; freeze overlapping intervals later
- `parallel_lifecycle_store` — P186.1 shadow vs P171 store
