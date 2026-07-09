# P178 — P158.3 Post-Assignment Workflow Transition

Generated: 2026-07-09T16:29:08.556Z
Dry-run passed: **true**
Live transitions: **21**

## Summary

- Meets P178 criteria: **21/25**
- P158.3 transition eligible: **21**
- Transition blocked: **4**
- Dry-run transitions: **21** (projected Send Paperwork: 21)
- Live transitions applied: **21**
- Rollback records created: **21**

## Post-Transition Counts (newest 25)

| Metric | Count |
| --- | ---: |
| Paperwork Needed | 21 |
| P157 Send Paperwork | 21 |
| P152 eligible | 21 |
| AUTO_SEND_PAPERWORK | 21 |
| Ready for controlled send | 21 |

## Workflow transition applied

For each transitioned candidate:

- `workflowStatus`: Applied → **Paperwork Needed**
- `actionType`: screen-candidate → **send-paperwork**

## Patricia Irby

- Assigned recruiter: **Logan**
- Transitioned to Paperwork Needed: **true**
- P157 Send Paperwork: **true**
- P152 eligible: **true**
- P169 outcome: **AUTO_SEND_PAPERWORK**
- P171 state: **APPROVED**
- Ready for controlled send (per-candidate): **true**

## Production gates (unchanged)

P169 production gates still **fail** (readiness score, autopilot env, executive WAIT). Per-candidate paperwork readiness is 21/25, but operator-controlled send remains blocked until production gates pass.

## Safety

- Workflow store writes only via P158.3 upsertCandidateWorkflow
- No paperwork sends executed
- No Breezy or Dropbox API calls
- P158.3 per-candidate rollback records registered before transition
- P169/P171 production gates unchanged

## Blocked Candidates

- **Darryl T. Williams**: Protected workflow status: Paperwork Sent
- **Latrese Crump**: Recruiter not assigned; DM not assigned; Recruiter not assigned.
- **June Ann Stagen**: Protected workflow status: Paperwork Sent
- **Taylor Custenborder**: Protected workflow status: Signed

## Post-Transition (newest 25)

| Rank | Name | Before → After | P157 | P152 | P169 |
| ---: | --- | --- | --- | --- | --- |
| 1 | David Karp | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 2 | april white | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 3 | Gregory Petties | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 4 | Liaunda Lang | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 5 | Mista Clark | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 6 | Norah Jones | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 7 | Jasmine Barber | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 8 | Terry Bryant | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 9 | Patrick Berry | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 10 | Lindsey Aaron | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 11 | Gianna DelGarbino | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 12 | Nykol Tindle | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 13 | Patricia Irby | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 14 | Darryl T. Williams | — → Paperwork Sent | Candidate Duplicate | no | NEEDS_MANUAL_REVIEW |
| 15 | Karen Burkes | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 16 | Gabriella Gandy | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 17 | Latrese Crump | — → Applied | Assign Recruiter | no | WAIT_NEXT_CYCLE |
| 18 | Monique Franklin | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 19 | Lovett Roberts | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 20 | Tasha Early | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 21 | Rebekah Hoover | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 22 | DEAN B. SERGIACOMI | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 23 | William Gustafson | Applied → Paperwork Needed | Send Paperwork | yes | AUTO_SEND_PAPERWORK |
| 24 | June Ann Stagen | — → Paperwork Sent | Candidate Duplicate | no | NEEDS_MANUAL_REVIEW |
| 25 | Taylor Custenborder | — → Signed | Candidate Duplicate | no | NEEDS_MANUAL_REVIEW |
