# Executive Production Gap Report (P188)

## Bottom line

P187 cannot select a canary cohort because **0** production candidates are at Hiring Recommendation.

Hiring Recommendation is **not** a stored workflow status. It is inferred when durable `recommendedStage` contains hire/recommend/paperwork signals. That field is **empty for all scanned candidates**.

## Funnel snapshot (furthest legitimate stage)

- **Applied:** 504
- **Recruiter Review:** 10
- **Hiring Recommendation:** 0
- **Operator Approved:** 0
- **Paperwork Needed:** 0
- **Paperwork Sent:** 122
- **Viewed:** 25
- **Signed:** 17
- **Ready for MEL:** 0
- **Exported:** 0
- **Other:** 6

## Where production stops

Production stops before Hiring Recommendation (Applied backlog + paperwork bypass). Highlight: Recruiter Review → Hiring Recommendation never materializes in durable state.

## Primary causes

1. **No durable recommendation evidence** (`recommendedStage` = 0).
2. **Mid-funnel bypass** via onboarding reconciliation (Applied → Paperwork Sent/Signed).
3. **No recruiter ownership** (all Unassigned) and **no job on workflow records** — P187 gates fail even if recommendations appear.
4. **HR creation path is fragmented**: UI display-only enrichment; auto-progression API unused in practice; no dedicated Recommend Hire API.

## What not to do yet

- Do not run P187 production canary.
- Do not enable continuous automation to “force” recommendations.
- Do not treat Paperwork Sent as proof of Operator Approved.

## Recommended next work (future phases — not P188)

1. Ship explicit recruiter **Recommend hire** write to `recommendedStage` + audit.
2. Assign recruiters / resolve job IDs for eligibility.
3. Prevent onboarding reconcile from skipping approval for unapproved Applied candidates.
4. Re-run P187.1 cohort selection.

## Validation

```json
{
  "productionWrites": 0,
  "candidateStateChanges": 0,
  "paperworkSends": 0,
  "approvals": 0,
  "melWrites": 0,
  "automationEnabled": false,
  "featureFlagsChanged": false
}
```
