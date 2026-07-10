# P182 — Scoped Operator Live Send

Generated: 2026-07-09T18:38:44.840Z

## Pre-send

- Send queue profile: **operator**
- Scoped cohort: `{"cohort":"p178_ready","newestApplicants":25}`
- Scoped pool count: **20**
- Eligible in scope: **20**
- Remaining eligible (not sent/signed): **20**
- Send cap (Dropbox budget): **17**
- Projected Dropbox API calls: **34**
- Continuous mode: **false**
- Daemon active: **false**
- Operator gate pass: **true**

### Patricia Irby

- In scoped pool: **true**
- P152 eligible: **true**
- Paperwork status: **not_sent**
- Remaining eligible: **true**
- Blockers: none

### Selected candidates (remaining eligible)

- David Karp (`5e64219daaf9`) — dmgkarp@gmail.com
- Gregory Petties (`86a8d6804b6b`) — shreddedsteel49@gmail.com
- Liaunda Lang (`80d87b758578`) — capri_lang@yahoo.com
- Mista Clark (`cda9067dac4b`) — mistac6@gmail.com
- Norah Jones (`1bd395fce633`) — norahjones2224@gmail.com
- Jasmine Barber (`2419559af1ba`) — jasmineshanae90@gmail.com
- Terry Bryant (`88bb0f06e75e`) — tjbryant2019@gmail.com
- Patrick Berry (`21dc66d94d31`) — bezothered@gmail.com
- Lindsey Aaron (`46551846149e`) — miayasmommy.la@gmail.com
- Gianna DelGarbino (`445225a971f7`) — giannadelgarbino@gmail.com
- Nykol Tindle (`91faef15d8fd`) — nykolcooper2@gmail.com
- Patricia Irby (`98400c5310f6`) — patricia.irby@aol.com
- Karen Burkes (`b32054c06f54`) — mrskarenburkes@gmail.com
- Gabriella Gandy (`6a850de9dc05`) — gabriellagandy9@gmail.com
- Monique Franklin (`6b40ff3b280a`) — franklinmonique392@gmail.com
- Lovett Roberts (`082c0eec6cff`) — teddylove092386@gmail.com
- Tasha Early (`1e0fbce8a310`) — etasha575@gmail.com

### Blockers


## Post-send

- Executed: **true**
- Sent: **17**
- Skipped: **0**
- Failures: **0**
- Cap reached: **true**
- Stopped on error: **false**
- Execution time (ms): **724650**
- Dropbox requests (delta): **19**
- Dropbox 429 events (delta): **1**
- Patricia Irby sent: **true**
- Remaining P178-ready: **3**
- Global pool leak detected: **false**

### Sent candidates

- David Karp (`5e64219daaf9`)
- Gregory Petties (`86a8d6804b6b`)
- Liaunda Lang (`80d87b758578`)
- Mista Clark (`cda9067dac4b`)
- Norah Jones (`1bd395fce633`)
- Jasmine Barber (`2419559af1ba`)
- Patrick Berry (`21dc66d94d31`)
- Lindsey Aaron (`46551846149e`)
- Gianna DelGarbino (`445225a971f7`)
- Nykol Tindle (`91faef15d8fd`)
- Patricia Irby (`98400c5310f6`)
- Karen Burkes (`b32054c06f54`)
- Gabriella Gandy (`6a850de9dc05`)
- Monique Franklin (`6b40ff3b280a`)
- Lovett Roberts (`082c0eec6cff`)
- Rebekah Hoover (`88340ea1bf94`)
- DEAN B. SERGIACOMI (`71ceb040896c`)

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

