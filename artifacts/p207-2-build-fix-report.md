# P207.2 — Build Fix Report

Generated: 2026-07-16T15:00:00.000Z (local validation run)

## Exact error reproduced

Command: `npm run build`

```
./src/lib/candidate-ingestion/merge-candidate-record.ts:43:5
Type error: Type 'BreezyOwnershipSignals | null | undefined' is not assignable to type 'BreezyOwnershipSignals | undefined'.
  Type 'null' is not assignable to type 'BreezyOwnershipSignals | undefined'.
```

| Item | Value |
| --- | --- |
| File / line | `src/lib/candidate-ingestion/merge-candidate-record.ts:43` |
| Inferred (callee return) | `BreezyOwnershipSignals \| null \| undefined` from `scrubDemoOwnershipSignals` |
| Expected (field type) | `BreezyOwnershipSignals \| undefined` on `BreezyCandidate.ownershipSignals` |
| Is `null` valid domain data? | Yes for the scrub helper (passthrough when input is null). Not valid on `BreezyCandidate.ownershipSignals`, which is optional (`undefined`), never `null`. |
| Contract incorrect? | Callee allows `null`; candidate model does not. Call-site needed null→undefined normalization. |

## Minimal fix applied

```ts
ownershipSignals:
  scrubDemoOwnershipSignals(
    incoming.ownershipSignals?.preferredName
      ? incoming.ownershipSignals
      : existing.ownershipSignals ?? incoming.ownershipSignals,
  ) ?? undefined,
```

- No `any`
- No non-null assertion
- No invented ownership evidence (`null`/`undefined` stay absent)
- Merge precedence unchanged (still prefer incoming preferredName when present; else existing ?? incoming)
- Demo scrub behavior unchanged

## Post-fix `npm run build`

Merge-candidate-record error: **cleared**.

Next Next.js typecheck failure (pre-existing, **outside P207.2 scope**):

```
./src/lib/p201-3-controlled-paperwork-needed-pilot/gates.ts:188:10
Type error: Conversion of type 'ScoredCandidateWorkflowRow' to type '{ nearbyJobsCount: number; }' may be a mistake...
```

P207.2 intentionally did **not** modify `p201-3` (scope = merge-candidate-record only).
