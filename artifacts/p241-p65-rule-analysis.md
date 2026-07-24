# P241 — P65.6 Qualification Root Cause Analysis (Read-Only)

Generated: 2026-07-21T14:33:17.170Z
Mode: **read_only** (forensic analysis only)
Phase: P241

## Verdict

All **8** P240 `qualification_gate_failed` candidates already have active paperwork packets. Live P65.6 correctly blocks re-promotion. P240 proxy replay mislabeled them because `replayAsFreshNew` reset stage/packet fields but **left stale `actionType`** (`await-signature` / `send-paperwork`), which still fails `canPromoteToPaperworkFunnel`.

Projected after automatic simulation fix: would-send **13/17** (Δ+8), auto-clear **76.5%**, health **83/100**, **GO_WITH_CONDITIONS**.

## All 8 candidates

### TOMMY EDWARD HARPER JR (`61244a24ba7e`)

- Applied: 2026-07-20T17:41:59.315Z
- Position: Retail Project Representative – Mid-Michigan Territory
- Recruiter / DM: Taylor / Trista Thomas
- Workflow / Breezy / paperwork: **Paperwork Sent** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `await-signature`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=await-signature after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Sent, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=await-signature, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=0, tier=tier1_0_20)

### Dylan Albright (`09d804b86cb5`)

- Applied: 2026-07-20T15:45:00.777Z
- Position: Retail Merchandiser – Northern Michigan Territory
- Recruiter / DM: Taylor / Trista Thomas
- Workflow / Breezy / paperwork: **Paperwork Sent** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `await-signature`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=await-signature after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Sent, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=await-signature, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=26.2, tier=tier2_21_39)

### Faith Bandy (`9d2a0cd6d508`)

- Applied: 2026-07-20T14:29:22.258Z
- Position: Retail Merchandiser - Youngstown/Warren Area
- Recruiter / DM: Taylor / Mindie Rodriguez
- Workflow / Breezy / paperwork: **Paperwork Sent** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `await-signature`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=await-signature after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Sent, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=await-signature, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=5.8, tier=tier1_0_20)

### Derrick Fowler (`c15e4466e945`)

- Applied: 2026-07-20T12:49:33.052Z
- Position: Retail Merchandiser - Newark/Heath Area
- Recruiter / DM: Taylor / Mindie Rodriguez
- Workflow / Breezy / paperwork: **Paperwork Sent** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `await-signature`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=await-signature after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Sent, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=await-signature, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=22.2, tier=tier2_21_39)

### Brian Alspaugh (`7ffaf043808e`)

- Applied: 2026-07-20T10:32:08.473Z
- Position: Part-Time Retail Merchandiser — Carlisle, PA
- Recruiter / DM: Taylor / Mindie Rodriguez
- Workflow / Breezy / paperwork: **Paperwork Sent** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `await-signature`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=await-signature after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Sent, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=await-signature, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=11.5, tier=tier1_0_20)

### Tyera Anderson-Rainey (`4c8aa3fd8f88`)

- Applied: 2026-07-19T21:02:28.013Z
- Position: Retail Service Merchandiser – Springfield, PA
- Recruiter / DM: Taylor / Mindie Rodriguez
- Workflow / Breezy / paperwork: **Paperwork Needed** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `send-paperwork`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=send-paperwork after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Needed, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=send-paperwork, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=0, tier=tier1_0_20)

### Samantha Bland (`cbe24e733f0a`)

- Applied: 2026-07-19T21:00:44.811Z
- Position: Retail Merchandiser Needed – Starkville
- Recruiter / DM: Taylor / Erin Boatright
- Workflow / Breezy / paperwork: **Paperwork Needed** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `send-paperwork`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=send-paperwork after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Needed, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=send-paperwork, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=0, tier=tier1_0_20)

### Yolanda Tolson (`f1c539dc4ed7`)

- Applied: 2026-07-19T19:44:29.203Z
- Position: Retail Coverage Merchandiser – Goldsboro, NC
- Recruiter / DM: Taylor / Erin Boatright
- Workflow / Breezy / paperwork: **Paperwork Needed** / Applied / sent
- Qualification status: already_past_qualification_packet_active (grade=D)
- AI grade: D
- actionType: `send-paperwork`
- Failed P65.6 check (P240 context): **action_type_blocks_promotion** (business_rule) — P240 replay kept stale actionType=send-paperwork after resetting stage to Applied
- Current-state first fail: `active_packet` (canPromote=false)
- P240-replay first fail: `action_type_blocks_promotion` (canPromote=false)
- Fixed-replay (clear actionType): canPromote=true
- Source: code_path
- Classification: **logic_bug** (hybrid)
- Recoverability: **automatic**
- Root cause: Candidate already advanced (workflow=Paperwork Needed, paperwork=sent). Live P65.6 correctly blocks re-promotion (active_packet). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=send-paperwork, which still fails canPromoteToPaperworkFunnel.
- Smallest safe correction: In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.
- Projected if recovered: **would_send** (miles=0, tier=tier1_0_20)

## Throughput simulation

| Metric | Baseline (P240) | Projected |
| --- | ---: | ---: |
| Would send | 5 | 13 |
| Auto-clear % | 29.4 | 76.5 |
| Daily throughput → Sent | 5.1 | 13.3 |
| Health score | 66 | 83 |
| GO / NO-GO | NO-GO | **GO_WITH_CONDITIONS** |

Projected reason: Projected pipeline is decision-complete with improved auto-clear, but remaining blockers (distance review / data quality) prevent full GO.

Remaining bottlenecks after qualification recovery:
- manual_review_40_60 (2, 50%)
- duplicate_identity (1, 25%)
- missing_phone (1, 25%)

## Assumptions

- Recovery = clear stale actionType/requiredAction on P240 replayAsFreshNew only (simulation measurement fix).
- Does not mutate live candidates, re-send paperwork, or bypass active-packet / never-resend rules.
- Proximity/DM gates re-evaluated with same P240 opportunity + position authority inputs.
- Non-qualification P240 blockers (manual_review_40_60, duplicate_identity, missing_phone) remain.

## Zero-write audit

- Unchanged: **true**
- Candidate writes: 0
- Workflow writes: 0
- Dropbox Sign calls: 0
- Recruiter ownership changes: 0
- DM assignment changes: 0
- Deployments / commits: 0 / 0
- Durable paths: .data/candidate-workflows.json, .data/candidate-ingestion.json, .data/p226-candidate-recovery-store.json, .data/p230-routing-recovery-store.json

## Tests

- Tests run: **10**
- Tests passed: **10**

## Artifacts

- `artifacts/p241-p65-rule-analysis.md`
- `artifacts/p241-rule-trace.json`
- `artifacts/p241-recovery-opportunities.json`
- `artifacts/p241-throughput-simulation.json`
- `artifacts/p241-zero-write-audit.json`

## Confirmation

P241 executed READ-ONLY. No candidate writes, workflow changes, recruiter/DM changes, Dropbox Sign, MEL mutations, Breezy writes, deployments, commits, merges, or pushes.
