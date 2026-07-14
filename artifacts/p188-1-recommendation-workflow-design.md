# P188.1 Recommendation Workflow Design

Phase: P188.1

## Architecture

```
Authorized recruiter/DM/executive/operator
  → validateRecommendHire (gates)
  → confirmation preview (no paperwork)
  → executeRecommendHire
       → upsertCandidateWorkflow({ recommendedStage: 'Hiring Recommendation' })
       → immutable recommend_hire audit (fail closed)
       → observeWorkflowUpsertSafe → P186 HIRING_RECOMMENDATION
  → P187 eligibility may detect candidate (authority flags remain OFF)
```

## Persisted evidence

- recommendedStage = `Hiring Recommendation`
- progressionReason / progressionGeneratedAt / actor note with corr+idem keys
- Does **not** set Paperwork Needed, Operator Approved, or send paperwork

## Sibling actions

- Return for More Review → Needs Review
- Mark Not Qualified
- Place on Hold (`[HOLD]` note)

## Recovery

- Recruiter: persisted → owner → Breezy → territory DM → audit → operator confirm (no guess)
- Job: position ID → friendly ID → aliases → unique title+city+state → operator confirm

## Mid-funnel bypass

- Detector flags Applied/Review → Paperwork Sent skips
- Optional `P188_PREVENT_ONBOARDING_MIDFUNNEL_BYPASS` keeps mid-funnel status while syncing historical paperwork fields

## Flags (default OFF)

```json
{
  "recommendationUi": false,
  "recommendationApi": false,
  "recruiterAssignmentRecovery": false,
  "jobAssignmentRecovery": false,
  "bulkRecommendationPreview": false,
  "bulkRecommendationExecution": false,
  "bypassFindingsDashboard": false,
  "preventOnboardingMidfunnelBypass": false
}
```
