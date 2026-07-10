# P183 — Final Scoped Operator Send

Generated: 2026-07-09T18:58:54.785Z

## Pre-send

- Scoped candidate count: **3**
- Remaining eligible: **3**
- Send cap: **3**
- Candidate IDs: `88bb0f06e75e`, `1e0fbce8a310`, `27d9e13536b0`
- Projected Dropbox API requests: **6** (POST 3, GET 3)
- Expected runtime: **8–14 min**
- Operator gate pass: **true**
- Readiness score: **0**
- Continuous mode: **false**
- Daemon active: **false**

### Candidates

- Terry Bryant (`88bb0f06e75e`) — tjbryant2019@gmail.com — eligible: true
- Tasha Early (`1e0fbce8a310`) — etasha575@gmail.com — eligible: true
- William Gustafson (`27d9e13536b0`) — willy93gizmo29pb@gmail.com — eligible: true

### Blockers


## Post-send

- Sent: **3**
- Skipped: **0**
- Failures: **0**
- Dropbox POST (delta): **3**
- Dropbox GET (delta): **0**
- Total API requests (delta): **3**
- 429 events (delta): **0**
- Retries (delta): **0**
- Rate-limit pause (delta ms): **0**
- Remaining P178-ready: **0**
- Remaining global eligible: **undefined**

### Sent

- Terry Bryant (`88bb0f06e75e`)
- Tasha Early (`1e0fbce8a310`)
- William Gustafson (`27d9e13536b0`)

## Validation

- zeroGlobalQueueLeakage: **true**
- onlyScopedCandidatesEvaluatedForSend: **true**
- noDuplicatePaperwork: **true**
- noBreezyWrites: **true**
- noDaemonStarted: **true**
- envLocalUnchanged: **true**
- continuousModeRemainedOff: **true**

### Working tree

```
M src/app/api/recruiting/operations-control-center/control/route.ts
 M src/lib/breezy-api.ts
 M src/lib/candidate-ingestion/merge-candidate-record.ts
 M src/lib/candidate-ingestion/run-ingestion-sync.ts
 M src/lib/candidate-ingestion/types.ts
 M src/lib/p152-immediate-paperwork-policy/execute-immediate-paperwork-policy.ts
 M src/lib/p152-immediate-paperwork-policy/index.ts
 M src/lib/p152-immediate-paperwork-policy/types.ts
 M src/lib/p154-continuous-autonomous-recruiting-runner/run-autonomous-recruiting-cycle.ts
 M src/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot.ts
 M src/lib/p154-full-candidate-backfill-continuous-processing/execute-backfill-cycle.ts
 M src/lib/p159-operations-control-center/execute-control-action.ts
 M src/lib/p169-autonomous-recruiting-orchestrator/evaluate-cycle-gates.ts
 M src/lib/p171-autonomous-candidate-lifecycle-manager/evaluate-lifecycle-gates.ts
?? artifacts/breezy-validation-report.json
?? artifacts/breezy-validation-report.md
?? artifacts/p174-breezy-sync-validation.json
?? artifacts/p174-breezy-sync-validation.md
?? artifacts/p174.1-complete-sync-validation.json
?? artifacts/p174.1-complete-sync-validation.md
?? artifacts/p175-breezy-export-import.json
?? artifacts/p175-breezy-export-import.md
?? artifacts/p175.1-post-import-automation-readiness.json
?? artifacts/p175.1-post-import-automation-readiness.md
?? artifacts/p176-recruiter-assignment-before-paperwork.json
?? artifacts/p176-recruiter-assignment-before-paperwork.md
?? artifacts/p176.1-post-assignment-paperwork-validation.json
?? artifacts/p176.1-post-assignment-paperwork-validation.md
?? artifacts/p177-questionnaire-gate-diagnosis.json
?? artifacts/p177-questionnaire-gate-diagnosis.md
?? artifacts/p177.1-business-workflow-validation.json
?? artifacts/p177.1-business-workflow-validation.md
?? artifacts/p178-p1583-workflow-transition.json
?? artifacts/p178-p1583-workflow-transition.md
?? artifacts/p179-operator-controlled-send-gate-profile.json
?? artifacts/p179-operator-controlled-send-gate-profile.md
?? artifacts/p180-operator-controlled-send-cycle.json
?? artifacts/p180-operator-controlled-send-cycle.md
?? artifacts/p181-scoped-operator-paperwork-queue.json
?? artifacts/p181-scoped-operator-paperwork-queue.md
?? artifacts/p182-scoped-operator-live-send.json
?? artifacts/p182-scoped-operator-live-send.md
?? diagnostics/
?? scripts/p173-breezy-production-validation.ts
?? scripts/p174-breezy-sync-validation.ts
?? scripts/p174.1-complete-sync-validation.ts
?? scripts/p174.1-rescan-stall-check.ts
?? scripts/p175-breezy-export-import.ts
?? scripts/p175.1-post-import-automation-readiness.ts
?? scripts/p176-recruiter-assignment-before-paperwork.ts
?? scripts/p176.1-post-assignment-paperwork-validation.ts
?? scripts/p177-questionnaire-gate-diagnosis.ts
?? scripts/p179-operator-controlled-send-gate-profile.ts
?? scripts/p181-scoped-operator-paperwork-queue.ts
?? scripts/p182-scoped-operator-live-send.ts
?? scripts/p183-final-scoped-operator-send.ts
?? src/app/api/recruiting/breezy-export-import/
?? src/app/api/recruiting/breezy-sync/
?? src/lib/candidate-ingestion/build-ingestion-scan-queue.test.ts
?? src/lib/candidate-ingestion/build-ingestion-scan-queue.ts
?? src/lib/p174-breezy-sync-reliability/
?? src/lib/p175-breezy-export-import/
?? src/lib/p175.1-post-import-automation-readiness/
?? src/lib/p176-recruiter-assignment-before-paperwork/
?? src/lib/p176.1-post-assignment-paperwork-validation/
?? src/lib/p177-questionnaire-gate-diagnosis/
?? src/lib/p179-operator-controlled-send-gate-profile/
?? src/lib/p181-scoped-operator-paperwork-queue/
```

