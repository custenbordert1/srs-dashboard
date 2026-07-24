# P188.3 Authoritative Recruiter Ownership Design

## Owner

CandidateWorkflowRecord.assignedRecruiter is the sole durable system of record, backed by an append-only ownership ledger and correlated Breezy assignee snapshot. Breezy remains a secondary import signal, never an override without explicit import rules.

## Lifecycle

- Create: workflow creation may leave Unassigned only when no authoritative signal exists.
- Import: if Breezy assignee/owner is present and roster-valid, set source=breezy_import with evidence hash.
- Auto-assign: territory engine may set source=auto only when Unassigned and confidence ≥ threshold.
- Manual: recruiter/executive UI sets source=manual and becomes sticky against auto overwrite.
- Recommend Hire / P187: require resolved non-Unassigned owner; never invent one.
- Archive/withdraw: freeze ownership (no auto reassign).

## Update rules

- All writes go through a single OwnershipWriter service (no direct Unassigned create overwrites).
- Empty/Unassigned incoming values never replace a named owner (strengthen existing resolveAssignedRecruiter).
- ingestion_import MUST NOT upsert assignedRecruiter; create path uses OwnershipWriter with import signals.
- Full-file store writers require optimistic concurrency (version/etag) or per-candidate lock.
- Every ownership change requires source, actor, confidence, evidenceRef, correlationId.

## Conflict rules

- If two named owners disagree across breezy_import vs auto vs audit_restore → do not assign; queue operator review.
- manual always wins over auto and breezy_import unless operator explicitly forces.
- Stale evidence (>30 days without confirm) cannot auto-apply; requires operator confirmation.
- P158 simulation never writes production ownership.

## Reassignment rules

- Auto reassignment allowed only from Unassigned, or via allowOverwrite + executive role.
- Territory redistributes only candidates with source=auto and no open paperwork/recommendation.
- Reassignment of source=manual requires dual confirmation (recruiter + operator).
- Bypass/late-funnel records may update ownership for accountability but remain P187-excluded until remediated.

## Audit requirements

- Append-only ownership ledger distinct from ephemeral workflow history rewrites.
- Record before/after, source, actor, evidenceRef, storeVersion, correlationId.
- Emit wipe detection alert when named→Unassigned occurs without explicit reassignment action.
- Retain ledger ≥ 1 year for reconstruction.

## Rollback

- Rollback restores previous named owner from ledger by correlationId.
- Never roll back to Unassigned if prior state was named unless explicit nullification reason.
- Rollback is preview-first; production requires operator token + flag.
- Rollback does not cascade into Recommend Hire, OA, paperwork, or MEL.

## Non-goals (P188.3)

- Do not implement the writer in this phase.
- Do not migrate production ownership in this phase.
- Do not enable P158 production assignment automatically.
