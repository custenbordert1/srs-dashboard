# Workflow Call Graph — Hiring Recommendation creation (P188)

```
UI candidates list
  → build-candidate-workflow-row.enrichRowWithCandidateProgression  [display_only]
  → (optional) candidate-workflow-client auto-progression
       → POST /api/candidates/workflows/auto-progression  [exists]
            → runCandidateProgressionEngine(persist:true)
                 → buildCandidateProgressionDecision
                 → applyCandidateProgressions
                      → upsertCandidateWorkflow(recommendedStage)  [storage]
                      → audit generate_candidate_progression

Parallel / competing:
  P151 / P83 applyCandidateAdvancements  [disabled / bypasses to Paperwork Needed]
  POST /api/candidates/workflows manual status  [exists]
  reconcile-workflow-from-onboarding  [executes — bypasses HR]

Shadow only:
  P186.1 deriveLifecycleState(recommendedStage → HIRING_RECOMMENDATION)  [replaced/shadow]

Missing:
  dedicated create-hiring-recommendation API  [never_called / does not exist]
```

## Node inventory

| ID | Kind | Status | Path |
|---|---|---|---|
| ui-progression-badge | ui | display_only | `src/components/recruiting/candidates-section.tsx (recommendedStage badge)` |
| ui-enrichment | enrichment | display_only | `src/lib/build-candidate-workflow-row.ts → enrichRowWithCandidateProgression` |
| api-auto-progression | api | exists | `POST /api/candidates/workflows/auto-progression` |
| ui-client-auto-progression | ui | exists | `src/lib/candidate-workflow-client.ts → auto-progression fetch` |
| workflow-progression-engine | workflow | executes | `src/lib/candidate-progression-engine/build-progression-decision.ts` |
| workflow-apply-progressions | workflow | exists | `src/lib/candidate-progression-engine/apply-candidate-progressions.ts` |
| workflow-p83-advancement | workflow | bypassed | `src/lib/candidate-advancement-engine/apply-candidate-advancements.ts` |
| api-p151-advancement | api | disabled | `POST /api/recruiting/candidate-pipeline-advancement` |
| api-workflows-upsert | api | exists | `POST /api/candidates/workflows` |
| storage-workflow-store | storage | executes | `src/lib/candidate-workflow-store.ts → upsertCandidateWorkflow` |
| audit-progression | audit | exists | `candidate-workflow-audit.jsonl action=generate_candidate_progression` |
| reconcile-onboarding | workflow | executes | `src/lib/workflow-onboarding-reconciliation/reconcile-workflow-from-onboarding.ts` |
| p186-shadow-hr | workflow | replaced | `src/lib/p186-1-lifecycle-state-machine/states.ts deriveLifecycleState` |
| dedicated-hr-api | api | never_called | `(none) dedicated create-hiring-recommendation endpoint` |

### ui-progression-badge
- Role: Displays progression recommendation to recruiters
- Detail: Shows recommendedStage when present on scored row; does not create HR by itself.

### ui-enrichment
- Role: Ephemeral recommendedStage attachment for UI/scoring
- Detail: Calls buildCandidateProgressionDecision when local.recommendedStage is empty; does NOT call upsertCandidateWorkflow.

### api-auto-progression
- Role: Batch generate + persist progression recommendations
- Detail: Exists and can execute with persist:true via runCandidateProgressionEngine. No evidence it has populated current store (recommendedStage=0).

### ui-client-auto-progression
- Role: Client trigger for auto-progression API
- Detail: Callable from recruiting UI; not continuously scheduled.

### workflow-progression-engine
- Role: Decide recommendedStage labels
- Detail: Produces Contact Candidate / Schedule Interview / Send Paperwork / Ready For MEL / Escalate — not an explicit 'Hiring Recommendation' label. 'Send Paperwork' would satisfy P187 recommend* mapping IF persisted.

### workflow-apply-progressions
- Role: Persist recommendedStage without changing workflowStatus
- Detail: Writes via upsertCandidateWorkflow + audit generate_candidate_progression.

### workflow-p83-advancement
- Role: Persist advancement labels; send-paperwork can force Paperwork Needed
- Detail: When shouldAdvance+send-paperwork, jumps Applied/Qualified → Paperwork Needed, skipping Operator Approved. Live P151 path flag-gated.

### api-p151-advancement
- Role: Autonomous advancement execute
- Detail: Blocked unless P151_AUTONOMOUS_ADVANCEMENT_ENABLED=true.

### api-workflows-upsert
- Role: Manual/status upsert including optional recommendedStage
- Detail: Can write recommendedStage if client sends it; recruiting UI primarily changes workflowStatus.

### storage-workflow-store
- Role: Authoritative production workflow persistence
- Detail: Supports recommendedStage field; current production file has 0 non-null values.

### audit-progression
- Role: Audit progression persistence
- Detail: Emitted when applyCandidateProgressions runs; absence of recommendedStage implies batch not applied recently.

### reconcile-onboarding
- Role: Sync paperwork/onboarding into workflowStatus
- Detail: Dominant mid/late funnel writer in current data: Applied → Paperwork Sent / Signed without creating HR evidence.

### p186-shadow-hr
- Role: Maps recommendedStage → HIRING_RECOMMENDATION (shadow)
- Detail: Shadow/read model only — not a production writer. P187 eligibility depends on this mapping over production fields.

### dedicated-hr-api
- Role: Explicit HR creation for operator queue
- Detail: No first-class API named for Hiring Recommendation. Closest are progression persist and manual workflows upsert.
