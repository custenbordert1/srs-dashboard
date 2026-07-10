# P177 — Questionnaire Gate Diagnosis Before Paperwork

Generated: 2026-07-09T15:59:29.784Z
Read-only: **true**

## Conclusion

**Review Questionnaire is primarily an artificial workflow gate: 0/25 have questionnaire data, export has none, and P152 already covers send risks. Safest path: non-blocking questionnaire for P152-eligible candidates + workflow transition to Paperwork Needed.**

## Key findings

- Export has questionnaire data: **false**
- Newest 25 with questionnaire in store: **0/25**
- Review Questionnaire count: **21/25**
- Artificial workflow gate: **21**
- True business requirement: **3**
- Would Send Paperwork (questionnaire bypass only): **0**
- Would Send Paperwork (questionnaire + Paperwork Needed): **21**

## P157 Send Paperwork requirements

- P152 paperworkEligible must be true (recruiter assigned, valid email, no duplicate, no active signature, not disqualified)
- workflowStatus === Paperwork Needed OR paperworkStage === awaitingRecruiterAction OR approvalQueue
- questionnaireComplete (questionnaireIntelligence.available) — any Breezy questionnaire answers present
- questionnaireTechReady !== false

## Questionnaire fields checked

- merchandisingExperience
- priorVendorExperience
- smartphoneAccess
- internetAccess
- comfortableWithApps
- printerLaptopAccess
- photoUploadComfort
- scheduleUnderstanding
- availabilityNotes
- techReady (derived from smartphone + internet + apps)

## P152 vs questionnaire

Not strictly required for Dropbox Sign 1099 packet delivery — P152 covers identity, duplicate, signature, and recruiter assignment. Questionnaire supports tech-readiness screening only.

P152 covers: unassigned_recruiter, invalid_email, duplicate_candidate, active_signature_request, paperwork_already_sent, paperwork_already_completed, disqualified_candidate, archived_candidate

## Recommended safest change

**Treat missing Breezy questionnaire as non-blocking when P152 passes and resume/export identity is present; advance workflow to Paperwork Needed via P158.3 transition (not paperwork send).**

0/25 newest candidates have questionnaire data in store. Breezy export has no questionnaire columns. P152 already blocks duplicates, invalid email, active signatures, and disqualified candidates. Questionnaire gate blocks Send Paperwork before workflow stage gate is even evaluated for Applied-status candidates.

- Classification: **artificial_workflow_gate**
- Expected paperwork sends after change: **21**
- Dropbox projection: **42** API calls

Safety:
- P152 would remain the send safety layer
- Duplicate and signature conflicts stay blocked
- No Breezy/Dropbox writes in diagnosis
- Questionnaire enrichment can be async — not a hard prerequisite for 1099 packet delivery

## Patricia Irby

- Recruiter: Logan
- P157 action: Review Questionnaire
- Questionnaire in store: no (0 answers)
- P152 eligible: yes
- Send if questionnaire bypass: no
- Send if full bypass: yes

Patricia has no questionnaire answers in the ingestion store (Breezy export lacks questionnaire columns; API enrichment not run). P152 passes. Questionnaire gate is artificial for export/API-synced candidates without enrichment.

## Newest 25 blocker breakdown

| # | Name | P157 | P152 | Q in store | Classification | Sim Q bypass | Sim full |
|---|------|------|------|------------|----------------|--------------|----------|
| 1 | David Karp | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 2 | april white | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 3 | Gregory Petties | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 4 | Liaunda Lang | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 5 | Mista Clark | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 6 | Norah Jones | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 7 | Jasmine Barber | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 8 | Terry Bryant | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 9 | Patrick Berry | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 10 | Lindsey Aaron | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 11 | Gianna DelGarbino | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 12 | Nykol Tindle | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 13 | Patricia Irby | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 14 | Darryl T. Williams | Candidate Duplicate | no | no | true_business_requirement | Candidate Duplicate | Candidate Duplicate |
| 15 | Karen Burkes | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 16 | Gabriella Gandy | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 17 | Latrese Crump | Assign Recruiter | no | no | safe_to_automate | Assign Recruiter | Assign Recruiter |
| 18 | Monique Franklin | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 19 | Lovett Roberts | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 20 | Tasha Early | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 21 | Rebekah Hoover | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 22 | DEAN B. SERGIACOMI | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 23 | William Gustafson | Review Questionnaire | yes | no | artificial_workflow_gate | Manual Review | Send Paperwork |
| 24 | June Ann Stagen | Candidate Duplicate | no | no | true_business_requirement | Candidate Duplicate | Candidate Duplicate |
| 25 | Taylor Custenborde | Candidate Duplicate | no | no | true_business_requirement | Candidate Duplicate | Candidate Duplicate |

## Must stay manual review (4)

- **Darryl T. Williams**: Recruiter not assigned.
- **Latrese Crump**: Recruiter not assigned.
- **June Ann Stagen**: Onboarding record already has an active signature request.
- **Taylor Custenborder**: Onboarding record already has an active signature request.

Full data: `artifacts/p177-questionnaire-gate-diagnosis.json`
