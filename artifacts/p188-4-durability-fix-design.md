# P188.4 Durability Fix Design

## Clobber paths fixed

1. **`sanitizeCandidate` ownership drop** — Breezy owner/assignee/recruiter nested fields are retained on `BreezyCandidate.ownershipSignals` (import signal only; not auto-authoritative).
2. **Ingestion backfill hardcoding `Unassigned`** — `backfillWorkflowRecordsForCandidates` no longer passes `assignedRecruiter: "Unassigned"`; omitted incoming cannot downgrade named owners.
3. **Full-file lost updates** — `writeStoreFile` re-reads disk and merges sticky ownership via `mergeWorkflowMapsForDurableWrite` so concurrent writers cannot wipe named recruiters or drop sibling records.
4. **Unlocked upsert races** — workflow mutations serialize through `withWorkflowStoreLock`.
5. **Priority-blind overwrite** — `decideOwnershipWrite` enforces source priority; equal-priority name conflicts fail closed into operator review.
6. **Missing ledger** — append-only ownership ledger (JSONL + optional Neon/PGlite) records before/after with idempotency keys.

## Ownership precedence

1. explicit manual / operator assignment (`manual`, `operator_restore`)
2. operator-confirmed historical restore (`operator_restore`)
3. executed production assignment (`production_assignment`)
4. authoritative internal assignment (`internal_assignment`)
5. Breezy owner/assignee import (`breezy_import`) — signal only
6. territory / auto default (`auto`, `territory_default`)
7. Unassigned

Lower priority never overwrites higher. Unassigned/null/empty never overwrites named.

## Optimistic concurrency

- `recruiterOwnershipVersion` on workflow records
- Upsert accepts `expectedOwnershipVersion` + `expectedRecruiter`
- Fail closed with `OwnershipConcurrencyError` on mismatch
- Version increments only when durable recruiter value changes

## Ledger

Append-only ownership ledger:

- Local: `.data/p188-4-ownership-ledger.jsonl` + process memory (default)
- Neon/PGlite: enable with `P188_OWNERSHIP_LEDGER_SQL=1` (table `p188_ownership_ledger`)

Fields: candidate ID, previous/new recruiter, source, actor, actor role, reason, timestamp, correlation ID, idempotency key, workflow version, confidence, evidence reference, rollback reference.

SQL is intentionally opt-in so ownership upserts never block on DB latency.

## Restore workflow (gated)

- Preview by default
- Requires `P188_OWNERSHIP_RESTORE_EXECUTION=true` + `allowProductionWrites` + operator token
- Max batch 50; canary package size 10
- Ownership-only updates; no lifecycle / Recommend Hire / OA / paperwork / MEL / P187

## Future operator restore canary command

```bash
P188_OWNERSHIP_RESTORE_EXECUTION=true npx tsx scripts/p188-4-execute-restore-canary.ts \
  --token "$OPERATOR_TOKEN" \
  --allow-production-writes \
  --limit 10
```

(Script prepared as gated entrypoint; default validation does **not** execute.)
