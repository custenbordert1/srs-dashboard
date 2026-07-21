# P242 — Fresh-New Replay State Reset Validation

Generated: 2026-07-21T14:46:53.849Z
Mode: **read-only / dry-run** — no live sends, commits, or deployments.

## Fix summary

P240 `replayAsFreshNew` now clears stale action-related state in addition to stage/packet fields.

### Action fields added to replay reset

- `actionType`
- `requiredAction`
- `actionReason`
- `actionDueDate`
- `actionGeneratedAt`
- `actionPriority`
- `actionConfidence`
- `nextActionNeeded`
- `lastActionAt`
- `recommendedStage`
- `progressionReason`
- `progressionConfidence`
- `progressionPriority`
- `progressionGeneratedAt`

Also continues clearing: `workflowStatus`→Applied, `paperworkStatus`→not_sent, `signatureRequestId`, paperwork timestamps/errors, `assignedDM`→Unassigned, `paperworkViewCount`, `paperworkTemplateKey`.

Live P65.6 is **unchanged**: `active_packet`, already-sent / signed / viewed packet protection, and actionType gates still apply on current-state evaluation.

## Tests

- Ran: 25
- Passed: 25

## Corrected 17-candidate disposition

| Disposition | Count |
|---|---:|
| would_send | 13 |
| manual_review | 2 |
| duplicate_identity | 1 |
| missing_phone | 1 |
| qualification_gate_failed | 0 |
| other_blocked | 0 |
| protected_skip | 0 |
| would_reach_paperwork_needed | 0 |

### Per-candidate

| Redacted ID | Name | Disposition | Blocker | Miles | P241 case |
|---|---|---|---|---:|---|
| 97feb30b7c0c | Shanyn Pough | would_send | — | 0 |  |
| 35ab8480f740 | Ashley Nicole cross | would_send | — | 0 |  |
| dc17da63ffaf | Ashley Nicole cross | duplicate_identity | duplicate_identity | — |  |
| 9cd69c8d0f97 | Ramon Johnson | manual_review | manual_review_40_60 | 54.1 |  |
| 61244a24ba7e | TOMMY EDWARD HARPER JR | would_send | — | 0 | yes |
| 9c2e0a8886f9 | Diandra Martinez | would_send | — | 0 |  |
| 09d804b86cb5 | Dylan Albright | would_send | — | 26.2 | yes |
| 9d2a0cd6d508 | Faith Bandy | would_send | — | 5.8 | yes |
| c15e4466e945 | Derrick Fowler | would_send | — | 22.2 | yes |
| 7ffaf043808e | Brian Alspaugh | would_send | — | 11.5 | yes |
| b156572d97fb | Ashley Flannory | missing_phone | missing_phone | — |  |
| ffd00f87573a | Susan Spinks | would_send | — | 32.2 |  |
| a746658cd038 | Destiny Hunt | manual_review | manual_review_40_60 | 54.1 |  |
| bc008165fb1b | Christina Lehman | would_send | — | 0 |  |
| 4c8aa3fd8f88 | Tyera Anderson-Rainey | would_send | — | 0 | yes |
| cbe24e733f0a | Samantha Bland | would_send | — | 0 | yes |
| f1c539dc4ed7 | Yolanda Tolson | would_send | — | 0 | yes |

## P241 eight-case action_type_blocks_promotion clearance

| Redacted ID | Prior actionType | Cleared | Unlocks would_send | Outcome |
|---|---|---|---|---|
| 61244a24ba7e | await-signature | yes | yes | would_send/— |
| 09d804b86cb5 | await-signature | yes | yes | would_send/— |
| 9d2a0cd6d508 | await-signature | yes | yes | would_send/— |
| c15e4466e945 | await-signature | yes | yes | would_send/— |
| 7ffaf043808e | await-signature | yes | yes | would_send/— |
| 4c8aa3fd8f88 | send-paperwork | yes | yes | would_send/— |
| cbe24e733f0a | send-paperwork | yes | yes | would_send/— |
| f1c539dc4ed7 | send-paperwork | yes | yes | would_send/— |

All eight cleared action_type_blocks_promotion: **YES**

## Before / after throughput

| Metric | P240 baseline | P242 corrected | P241 expected |
|---|---:|---:|---:|
| Would send | 5 | 13 | 13 |
| Auto-clear % | 29.4 | 76.5 | 76.5 |
| Daily to Sent | 5.1 | 13.3 | 13.3 |
| Health | 66 | 83 | 83 |
| Go/No-Go | NO-GO | GO_WITH_CONDITIONS | GO_WITH_CONDITIONS |

**Matches P241 projection.** Disposition: **GO WITH CONDITIONS**.

## Live P65.6 protection regression

- [PASS] **live_active_packet_blocks**: canPromote=false via active_packet / already_sent protection
- [PASS] **live_already_sent_protected_skip**: replayAsFreshNew=false → already_sent_or_signed
- [PASS] **replay_no_source_mutation**: workflow object deep-equal before/after simulate
- [PASS] **p65_action_type_gate_intact**: canPromoteToPaperworkFunnel still false for stale actionType on live row
- [PASS] **p65_active_packet_predicate_intact**: hasActivePacket + signed checks still enforce never-resend

## Zero-write audit

- Durable stores unchanged: **true**
- Live sends / Dropbox / workflow writes / commits / deployments: **0**

## Artifacts

- `artifacts/p242-replay-reset-validation.md`
- `artifacts/p242-corrected-throughput-simulation.json`
- `artifacts/p242-candidate-dispositions.json`
- `artifacts/p242-live-protection-regression.json`
- `artifacts/p242-zero-write-audit.json`

## Explicit confirmation

- No live paperwork sends
- No candidate / workflow / Breezy / Dropbox / MEL / recruiter / DM writes
- No commits or deployments
