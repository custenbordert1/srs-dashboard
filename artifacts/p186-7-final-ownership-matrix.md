# P186.7 Final Lifecycle Ownership Matrix

## Authoritative architecture

- **Authoritative lifecycle store:** candidate-workflow-store (production SoR) via approved adapters
- **Fallback authority:** On rollback: re-enable previous writer flag; P186 returns to shadow_observe; production workflow store remains SoR

### Event authority
- **breezy_ingestion:** Breezy → ingestion/backfill (seed only)
- **operator_approval:** P186.3 / P97 → workflow store
- **paperwork_send:** P184/P185 only
- **envelope_lifecycle:** Dropbox Sign webhook (+ P107 observe)
- **onboarding_ready_for_mel:** P186.5 review → workflow store
- **mel_export:** External MEL; P186 observes only
- **shadow:** P186.1/P186.2 observe — never SoR

### Allowed writers
- candidate-workflow-store-core
- p186-3-operator-approval-actions
- p186-5-post-sign-review
- p184-autonomous-paperwork-send-engine
- p185-production-paperwork-runner
- dropbox-sign-webhook
- onboarding-send-execute

### Prohibited writers (post-freeze)
- p1547-continuous-recruiting-runner (post freeze)
- p169-recruiting-orchestrator (post freeze)
- p171-lifecycle-manager production side-effects (post freeze)
- p106/p1061/p125/p136/p183 legacy send paths (post freeze)

### Isolated subsystems
- P184/P185 paperwork-send subsystem
- Dropbox Sign envelope authority
- MEL export destination
- P186 never bypasses operator approval or document requirements

## Transition ownership

| Transition | Future owner | Competing | Adapter | Approval | Idempotency | Rollback | Status |
|---|---|---|---|---|---|---|---|
| Applied→Recruiter Review | p186-lifecycle-control-plane→candidate-workflow-store-core | candidate-ingestion-backfill; p175-breezy-export-import; api-candidates-workflows | upsertCandidateWorkflow | false | candidateId+stage+sourceEventId | api-candidates-workflows | shadow_observe |
| Recruiter Review→Hiring Recommendation | p186-lifecycle-control-plane→candidate-workflow-store-core | api-candidates-workflows; p151-pipeline-advancement; recruiter UI | upsertCandidateWorkflow | false | candidateId+recruiterActionId | api-candidates-workflows | shadow_observe |
| Hiring Recommendation→Operator Approved | p186-3-operator-approval-actions→candidate-workflow-store-core | p97-approval-mode-persist; api-candidates-workflows | executeOperatorApprovalAction / upsertCandidateWorkflow | true | candidateId+approvalEventId | p97-approval-mode-persist | canary_ready |
| Operator Approved→Paperwork Needed | p186-3-operator-approval-actions→candidate-workflow-store-core | p83-candidate-advancement; p158-post-assignment-transition; p151-pipeline-advancement; p97-approval-mode-persist | upsertCandidateWorkflow (Paperwork Needed) | true | candidateId+approvalEventId+toStatus | api-candidates-workflows | canary_ready |
| Paperwork Needed→Paperwork Sent | p185-production-paperwork-runner→p184-autonomous-paperwork-send-engine→onboarding-send-execute | p106-autonomous-paperwork-engine; p1061-autonomous-paperwork-runner; p125-production-runner; p136-paperwork-scheduler; p152-immediate-paperwork; p84-autonomous-paperwork-send; p183-final-scoped-operator-send | P184 sender / onboarding-send-execute (isolated) | true | P184/P185 envelope idempotency keys | manual operator hold — do not resend | planned |
| Paperwork Sent→Viewed | dropbox-sign-webhook→candidate-workflow-store-core | p107-paperwork-monitor; p84 signature monitor | applyCandidatePaperworkViewed | false | signatureRequestId+eventType+eventTime | p107-paperwork-monitor (observe only) | shadow_observe |
| Viewed→Signed | dropbox-sign-webhook→candidate-workflow-store-core | p107-paperwork-monitor | applyCandidatePaperworkSigned | false | signatureRequestId+all_signed | p107-paperwork-monitor (observe only) | shadow_observe |
| Signed→Onboarding Complete | p186-5-post-sign-review→candidate-workflow-store-core | candidate-onboarding-engine; direct-deposit-workflow; hiring-automation-engine | executePostSignReviewAction / upsertCandidateWorkflow | true | candidateId+onboardingApprovalEventId | api-candidates-workflows | canary_ready |
| Onboarding Complete→Ready for MEL | p186-5-post-sign-review→candidate-workflow-store-core | candidate-onboarding-engine; hiring-automation-engine; p107-paperwork-monitor | approve_ready_for_mel → upsertCandidateWorkflow | true | candidateId+readyForMelApprovalEventId | api-candidates-workflows | canary_ready |
| Ready for MEL→MEL Export Review | p186-5-mel-export-queue (pending_review/approved_for_export only) | — | enqueueMelExportItem (no MEL write API) | true | mel idempotency key (candidate+assignment+job+approval) | cancel queue row (no MEL call) | planned |
| MEL Export Review→Exported | external MEL observe → confirmed_exported | — | observeExternalMelExport only | false | externalEventId+candidateId | n/a — do not un-export | planned |

Completeness: **PASS** (P184/P185 preserved: true)

P186.7 does not make P186 authoritative. Production workflow remains SoR.
