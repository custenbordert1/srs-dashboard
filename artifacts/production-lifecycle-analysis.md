# Production Lifecycle Analysis (P188)

Generated: 2026-07-13T18:50:30.325Z
Commit: `81039fba0bc58d1545dc8cd1c76073392785e2fe`
Candidates scanned: **684**

## Stage ownership & writers

| Stage | Count (furthest) | Avg age (d) | Owner | Writer | API | Expected next |
|---|---:|---:|---|---|---|---|
| Applied | 504 | 3.9 | Recruiter / ingestion | candidate-workflow-store / ingestion backfill | GET/POST /api/candidates/workflows + ingestion | Applied → Recruiter Review |
| Recruiter Review | 10 | 3.9 | Recruiter | api-candidates-workflows | POST /api/candidates/workflows | Recruiter Review → Hiring Recommendation |
| Hiring Recommendation | 0 | — | Recruiter → Operator | progression/advancement → upsert recommendedStage | POST /api/candidates/workflows/auto-progression; P83/P151 apply paths | Hiring Recommendation → Operator Approved |
| Operator Approved | 0 | — | Operator / executive | p186-3 / api-candidates-workflows / p97 | P186 operator queues; workflows upsert | Operator Approved → Paperwork Needed |
| Paperwork Needed | 0 | — | P184/P185 paperwork subsystem | P185 runner → P184 sender | P185 production automation APIs | Paperwork Needed → Paperwork Sent |
| Paperwork Sent | 122 | 3.7 | Dropbox Sign + workflow reconcile | onboarding reconciliation / paperwork status apply | webhooks + workflow reconcile | Paperwork Sent → Viewed |
| Viewed | 25 | 3.9 | Dropbox Sign | paperwork viewed apply | Dropbox webhook handlers | Viewed → Signed |
| Signed | 17 | 3.9 | Post-sign / MEL queue (P186.5 observe) | workflow store + P186.5 review | signed webhook; P186.5 actions | Signed → Ready for MEL |
| Ready for MEL | 0 | — | Operator / MEL ops | workflow Ready for MEL | workflows upsert; P186.5 queue | Ready for MEL → Exported |
| Exported | 0 | — | MEL / field ops | workflow status | workflows upsert / MEL observe | Terminal / monitor |
| Other | 6 | 3.9 | Recruiter | workflows upsert | POST /api/candidates/workflows | None / re-open |

## Entering / exiting notes

### Applied
- Entering: Breezy/ingestion → workflow seed Applied
- Exiting: Manual status change, Needs Review, or onboarding reconcile jump
- Workflow: upsertCandidateWorkflow; candidate ingestion backfill

### Recruiter Review
- Entering: Status Needs Review / Qualified or recruiter open
- Exiting: Recommendation / reject / hold
- Workflow: upsertCandidateWorkflow(workflowStatus)

### Hiring Recommendation
- Entering: Persisted recommendedStage hire/recommend/paperwork signal
- Exiting: Operator approval (P187 target)
- Workflow: applyCandidateProgressions / applyCandidateAdvancements

### Operator Approved
- Entering: Operator approval evidence / P186.3 approval adapter
- Exiting: Advance to Paperwork Needed
- Workflow: executeOperatorApprovalAction (often jumps to Paperwork Needed)

### Paperwork Needed
- Entering: Approval or P83 send-paperwork advance
- Exiting: P184/P185 send
- Workflow: recordCandidatePaperworkSent / onboarding send

### Paperwork Sent
- Entering: Send success or onboarding reconcile(sent)
- Exiting: Viewed / signed webhooks
- Workflow: reconcileWorkflowFromOnboarding; applyCandidatePaperwork*

### Viewed
- Entering: Dropbox viewed / reconcile(viewed)
- Exiting: Signed
- Workflow: applyCandidatePaperworkViewed

### Signed
- Entering: All signed / reconcile(ready_for_mel→Signed mapping)
- Exiting: Onboarding complete / Ready for MEL
- Workflow: applyCandidatePaperworkSigned

### Ready for MEL
- Entering: Operator MEL readiness approval
- Exiting: External MEL export observe
- Workflow: upsertCandidateWorkflow(Ready for MEL)

### Exported
- Entering: Loaded in MEL / Active Rep
- Exiting: Terminal
- Workflow: upsertCandidateWorkflow

### Other
- Entering: Not Qualified / unknown
- Exiting: n/a
- Workflow: upsertCandidateWorkflow


## Flow stop

Production stops before Hiring Recommendation (Applied backlog + paperwork bypass). Highlight: Recruiter Review → Hiring Recommendation never materializes in durable state.

# Production lifecycle flow (P188)

```
Applied
  ↓
Recruiter Review
  ↓
Hiring Recommendation
  ↓
Operator Approval
  ↓
Paperwork Needed
  ↓
Paperwork Sent → Viewed → Signed → Ready for MEL → Exported
```

**Current stop / bypass:** Production stops before Hiring Recommendation (Applied backlog + paperwork bypass). Highlight: Recruiter Review → Hiring Recommendation never materializes in durable state.

Observed production behavior:

- Most candidates **stop at Applied** (no recruiter claim / no HR evidence).
- A large secondary path **bypasses** mid-funnel via onboarding reconciliation:
  `Applied → Paperwork Sent / Signed` without Hiring Recommendation or Operator Approved.
- **Hiring Recommendation count = 0** in durable store.


## Safety

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
