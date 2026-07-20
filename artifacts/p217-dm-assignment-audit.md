# P217 — DM Assignment Resolution Audit

Generated: 2026-07-17T18:34:22.224Z · Read-only investigation.

## Blocked candidates

| Candidate | Applied position | Position.Location | Territory | Expected DM | Current DM | Stage | Paperwork | Root cause |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `3d272f69061a` | Retail Merchandiser (Flexible, Project-Based Work) | Columbus, OH | OH | Mindie Rodriguez | Unassigned | Paperwork Needed | not_sent | Assignment Engine Failure |
| `c0d00937ae31` | Retail Merchandiser (Flexible, Project-Based Work) | Kansas City, MO | MO | Amy Harp | Unassigned | Paperwork Needed | not_sent | Assignment Engine Failure |

## Exact failure point

- P205 transitions historical P204-approved candidates to Paperwork Needed without assignedDM; candidate-workflow-store preserves the existing 'Unassigned' value.
- runPostImportPipeline applies assignments only to filterMtdCandidates(...). These April historical applicants were outside the current-month import assignment cohort.
- DM persistence in applyRecruiterAssignments is coupled to decision.shouldAssign (recruiter assignment). No standalone territory-DM repair ran for P204/P205.

Both candidates classify as **Assignment Engine Failure**: territory and DM lookup succeed, but no applicable assignment execution persisted the deterministic DM.

## Territory verification

| Position.Location | Expected mapping | Actual map result | Correct |
| --- | --- | --- | --- |
| Columbus, OH | Mindie Rodriguez | Mindie Rodriguez | YES |
| Kansas City, MO | Amy Harp | Amy Harp | YES |

Expected DM accuracy: **2/2 (100%)**.

## Global active-candidate audit

Active scope: all workflows except `Not Qualified` (857).

- Assigned DM: 256
- Unassigned DM: 601
- Automatically assignable from Position.Location → territory → DM: 373

### Unassigned by stage

| Stage | Count |
| --- | --- |
| Applied | 402 |
| Paperwork Sent | 172 |
| Signed | 15 |
| Needs Review | 8 |
| Paperwork Needed | 4 |

### Unassigned by territory

| Territory | Count |
| --- | --- |
| Unknown | 228 |
| TX | 52 |
| PA | 49 |
| AR | 40 |
| NY | 27 |
| GA | 22 |
| OH | 16 |
| SC | 16 |
| AZ | 15 |
| NC | 14 |
| FL | 13 |
| KY | 13 |
| WA | 11 |
| IL | 9 |
| MA | 6 |
| NV | 6 |
| OR | 6 |
| WI | 6 |
| MI | 5 |
| TN | 5 |
| WV | 5 |
| CT | 4 |
| LA | 4 |
| MO | 4 |
| AL | 3 |
| IN | 3 |
| NJ | 3 |
| VT | 3 |
| CA | 2 |
| MD | 2 |
| NM | 2 |
| VA | 2 |
| IA | 1 |
| ID | 1 |
| MS | 1 |
| NE | 1 |
| NH | 1 |

### Unassigned by recruiter

| Recruiter | Count |
| --- | --- |
| Unassigned | 601 |

## Assignment pipeline and code audit

### Candidate Import / Breezy Sync
- File/function: `src/lib/candidate-ingestion/run-post-import-pipeline.ts` — `runPostImportPipeline`
- Behavior: Builds assignment decisions only for filterMtdCandidates(...). Historical candidates outside the current-month import cohort are not passed to assignment.

### Territory Mapping
- File/function: `src/lib/dm-territory-map.ts` — `getDmForState`
- Behavior: Deterministic state → DM map. OH resolves to Mindie Rodriguez; MO resolves to Amy Harp.

### Candidate / Job State Selection
- File/function: `src/lib/candidate-dm-suggest.ts` — `resolveCandidateState / suggestDmForCandidate`
- Behavior: Selects job state before candidate home state and maps it to a suggested DM. It is pure logic and does not persist an assignment.

### Assignment Decision
- File/function: `src/lib/recruiter-assignment-engine/build-assignment-decision.ts` — `buildRecruiterAssignmentDecision`
- Behavior: Resolves territoryState and dmName, but returns shouldAssign=false when recruiter ownership does not need auto-assignment.

### Assignment Persistence
- File/function: `src/lib/recruiter-assignment-engine/apply-recruiter-assignments.ts` — `applyRecruiterAssignments`
- Behavior: Persists assignedDM only for decisions with shouldAssign=true. DM assignment is coupled to recruiter assignment.

### Standalone Territory Assignment
- File/function: `src/lib/p151-workflow-bottleneck-resolution/apply-territory-dm-assignments.ts` — `applyTerritoryDmAssignments`
- Behavior: Can repair Unassigned DM from candidate/job state, but it is invoked by specific P151 pipelines—not by P204/P205.

### Operator Assignment
- File/function: `src/app/api/candidates/workflows/route.ts` — `POST workflow assignment path`
- Behavior: Accepts assignedDM from an authenticated operator and persists it through upsertCandidateWorkflow. No operator assignment exists for the two targets.

### MEL Sync
- File/function: `src/lib/mel-projects-sheet.ts` — `fetchMelProjectsSheet`
- Behavior: Supplies operational project/coverage data only. It has no assignedDM write path and cannot repair candidate workflow ownership.

### Workflow Store Default
- File/function: `src/lib/candidate-workflow-store.ts` — `upsertCandidateWorkflowUnlocked`
- Behavior: assignedDM = input.assignedDM?.trim() || existing?.assignedDM || 'Unassigned'. A transition that omits assignedDM preserves the existing Unassigned value.

### Qualification Recommendation
- File/function: `src/lib/p204-1-supervised-qualification-pilot/execute.ts` — `executeP2041RecommendationPilot`
- Behavior: Writes recommendation notes only; intentionally makes no ownership change.

### Paperwork Needed Transition
- File/function: `src/lib/p205-controlled-lifecycle-action-pilot/execute.ts` — `executeP205ControlledLifecyclePilot`
- Behavior: Moves approved historical candidates to Paperwork Needed without assignedDM; workflow store therefore preserves Unassigned.

### Paperwork Eligibility
- File/function: `src/lib/p214-unsent-test-batch/eligibility.ts` — `evaluateP214Gates`
- Behavior: Read-only consumer: compares persisted assignedDM with expectedDM and blocks Unassigned; it does not assign.

## Safety

- Workflow changes: 0 · stage movements: 0 · MEL writes: 0 · Breezy writes: 0 · Dropbox writes: 0
- P217 workflow writes: 0 · target workflow fields unchanged=true
- Whole workflow store unchanged=false (concurrent external store activity observed=true) · ingestion store unchanged=true

