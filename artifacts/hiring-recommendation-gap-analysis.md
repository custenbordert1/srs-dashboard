# Hiring Recommendation Gap Analysis (P188)

Hiring Recommendation furthest-stage count: **0**
Persisted recommendedStage rows: **0**

## Why zero candidates reached Hiring Recommendation

- Production workflowStatus enum has no 'Hiring Recommendation' value — HR is a P186 shadow stage derived from recommendedStage (+ not past Operator Approved).
- Persisted recommendedStage count is zero across the scanned store — P187 eligibility requires recommendation evidence.
- Candidate progression engine can write recommendedStage via POST /api/candidates/workflows/auto-progression, but labels are Contact/Interview/Send Paperwork/etc., and the batch has not populated the store (0 rows).
- UI enrichment in build-candidate-workflow-row attaches progression in-memory (display_only) without durable write.
- P83 applyCandidateAdvancements can set recommendedStage but live P151 advancement remains flag-gated; send-paperwork path jumps to Paperwork Needed, skipping Operator Approved.
- Onboarding reconciliation frequently advances Applied → Paperwork Sent / Signed, bypassing mid-funnel stages (Qualified, Paperwork Needed, Hiring Recommendation).
- All scanned candidates have assignedRecruiter=Unassigned — P187 also requires resolved operator owner.
- Workflow records lack durable job assignment fields — P187 jobAssignmentResolved fails closed.

## Block-reason rollup (pre + bypassed candidates)

```json
{
  "missingRecommendationEvidence": 684,
  "missingRecruiterAction": 684,
  "missingApiCall": 684,
  "missingWorkflowTransition": 678,
  "unresolvedJob": 684,
  "unresolvedOwner": 684,
  "missingStateMapping": 684
}
```

## Expected vs actual

- **Expected:** Applied → Recruiter Review → durable Hiring Recommendation (`recommendedStage`) → Operator Approved → Paperwork Needed → send.
- **Actual:** Applied backlog (majority) OR onboarding reconcile jump to Paperwork Sent/Signed; no durable HR evidence; owners Unassigned; no job on workflow records.

## Sample gaps (redacted)

- 1b3a2f…b63c: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- 5da2f2…1b96: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- 272690…a5b9: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- f700c2…0f03: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- c5b232…837a: expected="Pass through Recruiter Review → Hiring Recommendation → Operator Approved → Paperwork Needed before send" actual="Reached Paperwork Sent via onboarding/paperwork path without persisted Hiring Recommendation"
- afa412…d361: expected="Pass through Recruiter Review → Hiring Recommendation → Operator Approved → Paperwork Needed before send" actual="Reached Paperwork Sent via onboarding/paperwork path without persisted Hiring Recommendation"
- 570d0e…132e: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- 1b909b…99ec: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- cbc938…11b2: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- faec52…e4c9: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- 305e36…07a8: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- 520ae0…6673: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- de921c…199b: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- 968499…4533: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
- 911157…89ae: expected="Recruiter produces hiring recommendation (persisted recommendedStage) at HIRING_RECOMMENDATION" actual="Stuck at production status Applied / furthest Applied; recommendedStage=null"
