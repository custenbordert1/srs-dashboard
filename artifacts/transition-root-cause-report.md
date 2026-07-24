# Transition Root Cause Report (P188)

| Missing transition | Root cause | Impact | Proposed fix | Effort | Risk |
|---|---|---|---|---|---|
| Applied → Recruiter Review | 504/684 remain Applied; recruiter assignment all Unassigned; little durable recruiter action | Intake backlog; no funnel into recommendation | Operational: assign recruiters; optional: persist Needs Review when recruiter opens/claims candidate | M | low |
| Recruiter Review → Hiring Recommendation | No durable recommendedStage writes; progression persist path unused/empty; no dedicated HR API; UI enrichment is display-only | P187 HR→OA canary cohort size = 0; P186 waiting_operator_approval queue empty | Add explicit recruiter 'Recommend hire' action that upserts recommendedStage (e.g. recommend_hire) + audit; optionally run controlled auto-progression persist for Send Paperwork labels only after Qualified | M | medium |
| Hiring Recommendation → Operator Approved | No candidates in HR stage to approve; P186.3 approve_hiring_recommendation jumps to Paperwork Needed | Cannot validate P187 single-transition canary | After HR evidence exists, use P187 adapter that writes Operator Approved evidence without Paperwork Needed; keep P186.3 approve path separate | M | medium |
| Operator Approved → Paperwork Needed | Skipped entirely when onboarding reconcile/send lands Paperwork Sent from Applied | Lifecycle ownership matrix mid-funnel never exercised | Stop treating onboarding reconcile as authority for pre-approval candidates; require Paperwork Needed after OA before send | L | high |
| Job + owner resolution for P187 gates | Workflow store lacks job assignment; all owners Unassigned | Even with recommendedStage, P187.1 eligibility fails closed | Persist job/position on workflow or join Breezy candidate.positionId during eligibility; require assigned recruiter/DM before HR | M | low |

**No fixes implemented in P188.**
