# P262 — Ownership Durability & Deployment Readiness

Generated: 2026-07-23  
Scope: Fix equal-priority ownership merge that could revert confirmed recruiter/DM assignments; prepare P259–P261 for safe Vercel deployment. **No paperwork sends.** Dropbox quota/packet behavior unchanged.

## Five verdicts

| # | Area | Verdict | Notes |
|---|------|---------|-------|
| 1 | Ownership durability (equal-priority fix) | **GO** | Fresher `ownershipVersion` / `assignedAt` wins at equal priority; stale never overwrites newer confirmed write; upsert returns post-merge disk record. |
| 2 | Authoritative precedence model | **GO** | Documented + enforced bands: Confirmed operator → Approved automated → Breezy → Workflow-restore mechanism → Inferred/default → Unassigned. |
| 3 | P259–P261 regression (tests + fail-closed) | **GO** | 71/71 related tests passed (P188.4, P262, P258, P259, P260, P261). P260 quota-0 fail-closed unchanged. Client recruiting surfaces have **no** `node:fs/promises`. Local signed-in browser re-run blocked (dev server down); prior P261 signed-in evidence retained. |
| 4 | Actual live paperwork send (quota 0) | **NO-GO** | Production Dropbox Sign quota remains **0**. Fail-closed. Do not substitute testMode. **0** packets this phase. |
| 5 | Vercel deployment readiness | **CONDITIONAL GO** | Nonsecret env present locally + Preview/Production presence per P261 audit. Redeploy required after merge to pick up ownership fix. **No deploy/commit/push** this phase. |

## Root cause

`writeStoreFile` re-reads disk and runs `mergeOwnershipSticky(disk, incoming)` **without** `allowForceOverwrite`.

`decideOwnershipWrite` treated equal-priority name conflicts as “always preserve existing (disk)”. When an operator confirmed Assign Recruiter (manual → manual) while disk still held a prior same-priority owner:

1. Upsert applied the write in memory (force path).
2. Durable merge on write preferred the **stale disk** owner.
3. API could return the intended recruiter while disk retained the old one → refresh/sync looked like a revert.

P261 hit the same sticky rule on restore (API restore blocked; disk restore required).

## Precedence (authoritative)

1. **Confirmed operator** — `manual`, `operator_restore`, `operator_confirmed_historical_restore`
2. **Approved automated** — `production_assignment`, `internal_assignment`
3. **Breezy-sourced** — `breezy_import`
4. **Workflow-restored** — durable merge preferring fresher disk/incoming ownership (mechanism)
5. **Inferred/default** — `auto`, `territory_default`
6. **Unassigned** — never overwrites named

Equal priority: higher `recruiterOwnershipVersion`, else newer `recruiterAssignedAt`. Tied/unknown → fail closed (preserve current) + Activity conflict entry.

## Fix (smallest safe)

- Timestamp/version-aware equal-priority resolution in `precedence.ts`
- Sticky DM merge with `dmAssignmentSource` / `dmAssignedAt` / `dmAssignedBy` / `dmOwnershipVersion`
- Durable recruiter metadata: `recruiterAssignedBy`, `recruiterConfirmationStatus`, version, source, assignedAt
- Rejected conflicts → operator-safe Activity history (candidate owners, sources/bands, timestamps, reason; no internals)
- Upsert returns **post-merge** durable record
- UI: Operator source + time + identity on badges and Operations/Hiring drawers

## Phase 1 reproduce

In-memory merge race (no hard-coded production candidate ID; ephemeral `p262-repro-*`):

| Step | Result |
|------|--------|
| Prior manual on disk + newer operator manual incoming | Operator write **sticks** |
| Stale concurrent full-file rewrite | Confirmed ownership **preserved**; Activity conflict recorded |
| Breezy sync after confirm | **Blocked**; retained operator |
| Dropbox packets | **0** |

Evidence: `artifacts/p262-reproduce-trace.json`

## Phase 5 / 6 notes

- Signed-in Job Management / JCC / Operations browser pass: **not re-executed** (localhost:3000 down). Unit + prior P261 signed-in evidence used.
- Client fs graph: recruiting UI + P259 eligibility path clean of `node:fs/promises`. P260 `refresh.ts` uses `node:fs` **server-side only** (API route); client imports only `P260_CONFIRMATION_PHRASE` from types.
- Env (presence only): local `SESSION_SECRET`, `BREEZY_API_KEY`, `DATABASE_URL`, `DROPBOX_SIGN_API_KEY` present; Vercel Preview/Production presence per P261 (`SESSION_SECRET`, `BREEZY_API_KEY`, `DATABASE_URL`, `CRON_SECRET`).
- Login: `src/app/login/page.tsx`; auth via `src/proxy.ts` (no classic `middleware.ts`).
- APIs: workflows + JCC send-paperwork routes present.
- Migrations: P185.5 durable storage module present.

### Redeploy checklist (do not execute unless authorized)

1. Merge P262 ownership + prior P261 client-safe import split.
2. Confirm Vercel env names present (no secret echo): `SESSION_SECRET`, `BREEZY_API_KEY`, `DATABASE_URL`, `DROPBOX_SIGN_API_KEY`, `CRON_SECRET`.
3. Deploy Preview → smoke `/login`, Job Management → JCC → Operations, Assign Recruiter/DM, refresh, P260 preview fail-closed.
4. Deploy Production only after Preview smoke.
5. Confirm Dropbox quota still fail-closed if quota=0.

### Rollback checklist

1. Revert deploy to previous Vercel deployment.
2. Confirm ownership store file integrity (no truncated JSON).
3. Re-check `/login` and JCC load.
4. Do **not** attempt live send during rollback validation while quota=0.

## Tests

```bash
NODE_ENV=development node --import tsx --test \
  src/lib/p188-4-recruiter-ownership-durability/__tests__/p188-4-recruiter-ownership-durability.test.ts \
  src/lib/p188-4-recruiter-ownership-durability/__tests__/p262-ownership-durability.test.ts \
  src/lib/p258-hiring-workspace/p258-hiring-workspace.test.ts \
  src/lib/p259-candidate-operations/p259-candidate-operations.test.ts \
  src/lib/p260-live-paperwork-workspace/p260-live-paperwork-workspace.test.ts \
  src/lib/auth/p261-auth-recovery.test.ts
```

**Result: 71/71 passed** (P262 suite registered via existing `p188-4-recruiter-ownership-durability/__tests__/*.test.ts` glob).

Covered: equal-priority newer wins; stale rejected; Unassigned cannot overwrite; lower priority cannot overwrite confirmed; DM sticky; Activity conflict formatting; no client `node:fs/promises`.

## Writes / packets

| Metric | Count |
|--------|------:|
| Dropbox packets created | **0** |
| Workflow Paperwork Sent from send | **0** |
| Live production candidate ownership writes this phase | **0** (in-memory reproduce only) |
| Quota / packet behavior changes | **None** |

## Outstanding blockers

1. Dropbox production quota = **0** → live send NO-GO.
2. Preview/Production **redeploy** not authorized (no push/deploy).
3. Signed-in browser re-validation pending local/preview server after deploy.
