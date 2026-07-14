# P188.3 Root Cause Report — Recruiter Ownership

Generated: 2026-07-13T19:52:34.604Z

## Verdict

**Breezy ownership never imported (schema drop) + durable Unassigned create path + lost-update/overwrite of historical auto-assignments (ingestion race / unlocked store) + P158 production assignment disabled.**

## Why ownership disappeared

Named recruiters were assigned by automation (audit), then wiped when concurrent ingestion_import / full-file upserts recreated or clobbered workflow rows as Unassigned. Breezy owner was never available as a backfill source because sanitize discards it.

## Primary findings

### schema_mismatch

Breezy ownership is never mapped into the SRS candidate or workflow schema — primary upstream gap.

Evidence:
- BreezyCandidate has no owner/assignee/recruiter fields after sanitizeCandidate
- Ingestion owner-like keys present: 0
- UI join uses local assignedRecruiter only (build-candidate-workflow-row)

### never_imported

Ingestion creates workflow ownership as Unassigned and never imports Breezy owners.

Evidence:
- backfillWorkflowRecordsForCandidates hardcodes assignedRecruiter: 'Unassigned' on create
- merge-candidate-record does not merge recruiter

### overwritten

P62/territory auto-assign historically persisted named recruiters, then concurrent ingestion_import / lost-update races wiped durable ownership back to Unassigned.

Evidence:
- Audit shows named auto_assign for 377 current candidates while durable store is 100% Unassigned
- Rapid wipe pattern (named then ingestion_import): 2444 observed pairings
- candidate-workflow-store uses unlocked full-file read→mutate→write
- resolveAssignedRecruiter cannot preserve ownership when clobbering write believes record is new


## Secondary findings

- **disabled_feature**: P158 durable production assignment never ran in this environment — cannot replenish wiped owners.
- **missing_integration**: Enrichment and export paths lack a durable Breezy→workflow ownership integration.
- **regression**: Ownership disappearance is a durability regression (lost update / recreate), not an intentional policy to leave all Unassigned.
- **never_persisted**: Simulated recommendations were never persisted as authoritative ownership.
- **imported_then_discarded**: If Breezy responses include owner, it is discarded at sanitize — never reaches `.data`.
- **missing_migration**: No authorized migration restores last durable named recruiter from audit into workflow rows.

## Current durable state

- Workflow records: 684
- Unassigned: 684 (expected from probe)
- Historical named assignments available in audit (not restored): 377
- Rapid wipe pairings observed: 2444

## Side effects

All zero — analysis only.
