# P186.3 Operator Lifecycle Dashboard — Design

Generated: 2026-07-13

## Objective

Operator-facing lifecycle queues and bulk/approval actions backed by **P186 shadow data**, with production workflow remaining the system of record. P186 stays non-authoritative.

## Architecture

```
Production SoR (candidate-workflow-store / Breezy / Dropbox / MEL)
        │ observe (P186.2 dual-write hooks)
        ▼
P186.1 shadow FSM + audit
        │
        ▼
P186.3 queue classification + RBAC + dashboard
        │
        ├── GET /api/recruiting/p186-operator-queues/status
        ├── GET /api/recruiting/p186-operator-queues/detail
        └── POST /api/recruiting/p186-operator-queues/actions
                │
                ├── read-only: notes, labels, redacted export, conflict acknowledge
                └── approvals (flagged): upsertCandidateWorkflow → observe hook
```

### Module layout

- `src/lib/p186-3-operator-lifecycle-queues/` — queues, gates, RBAC, approval/bulk adapters, audit, dashboard builder
- `src/components/executive/p186-operator-lifecycle-panel.tsx` — operator UI + detail drawer
- `src/hooks/use-p186-operator-queues.ts` — client data/actions
- Feature flags default **off**

### Queues

Waiting recruiter review · Hiring recommendation needed · Waiting operator approval · Approved waiting paperwork · Paperwork sent/viewed/signed · Onboarding incomplete · Ready for MEL · Export blocked · Lifecycle conflicts · Missing shadow

Each queue surfaces count, oldest/avg age, blocked count, priority count, ownership, production vs shadow state, mismatch status.

## Approval-action design

1. Safety gates (identity, production present, expected state, holds, withdraw/archive, auth, duplicate, conflict)
2. Write **only** via `upsertCandidateWorkflow` (existing production path)
3. On success: `observeWorkflowUpsertSafe` updates shadow
4. On failure: no shadow mutation; audit failure
5. P186 never CAS-updates lifecycle as a substitute for production

## Bulk safety

- Configurable batch limit (`P186_BULK_BATCH_LIMIT`, default 25, max 100)
- Preview → confirmation → execute
- Per-candidate gate validation
- Partial success with explicit failed reasons + rollback guidance
- No bulk paperwork send

## RBAC

| Role | Queues | Actions |
|------|--------|---------|
| Read-only viewer | all (view) | view, filter/sort |
| Recruiter | recruiter-facing | notes, labels, return-for-info, export |
| DM | territory set | holds, return, notes |
| Operator | all | approvals + bulk + conflict review |
| Executive | all | same as operator (no paperwork-send bypass) |

## Isolation

- No P184/P185 package behavior changes
- No Dropbox send / MEL export / continuous automation flags
- Dashboard idle when `P186_OPERATOR_DASHBOARD` is off
