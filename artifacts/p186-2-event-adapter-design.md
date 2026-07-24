# P186.2 — Production Event Adapters & Shadow Dual-Write

**Status:** Implemented (shadow-only)  
**Date:** 2026-07-13  
**Depends on:** P186.1

## Objective

Connect production lifecycle signals into the P186.1 Neon-backed state machine **without** making P186 authoritative and **without** changing production behavior beyond optional, fail-soft observe hooks.

## Architecture

```
Production systems (authoritative)
  Breezy / Recruiter UI / Operator / Workflow store / Dropbox webhook / P184-P185 outcomes
        │
        │  adapters (normalize)
        ▼
  P186NormalizedLifecycleEvent
        │
        ▼
  ShadowDualWriteIngestor  ──► p186_event_inbox + comparisons
        │
        ▼
  P186.1 LifecycleStateMachine (shadow only)
```

**Hard wall:** P186 never writes Breezy, Dropbox Sign, MEL, P184/P185, or production workflow stores (except existing production writers remain unchanged; observe runs *after* production success).

## Normalized event

| Field | Purpose |
|---|---|
| eventId | Stable unique id |
| candidateId | Subject |
| eventType | Canonical verb |
| sourceSystem | breezy, recruiter, operator, p184, p185, dropbox_sign, … |
| sourceTimestamp / receivedTimestamp | Ordering + lag |
| actor / correlationId / idempotencyKey | Audit + dedupe |
| payloadVersion | Schema version |
| redactedMetadata | No emails/names/URLs/secrets |

## Adapters

| Adapter | Maps to |
|---|---|
| Breezy stage | candidate_applied, breezy_stage_changed, recruiter_claimed |
| Recruiter | claim / recommend / reject |
| Operator | approve / deny |
| P184/P185 observe | paperwork_needed, confirmed_sent, viewed, signed, declined, canceled, failed |
| Dropbox Sign | viewed, signed, declined, canceled, failed |
| Onboarding | onboarding_complete |
| MEL | ready_for_mel, mel_exported |
| Reconcile | reconcile_tick |
| Workflow store | best-effort observe from status fields |

## Dual-write observe hooks (fail-soft)

- `dropbox-sign-webhook-handler.ts` — after successful viewed/signed handling
- `candidate-workflow-store.upsertCandidateWorkflow` — after successful FS write

Both use dynamic import + `.catch(() => undefined)` and respect feature flags (default **off**).

## Feature flags (default off)

- `P186_SHADOW_INGESTION`
- `P186_ADAPTER_BREEZY` / `RECRUITER` / `OPERATOR` / `PAPERWORK` / `DROPBOX` / `ONBOARDING` / `MEL` / `RECONCILE`
- `P186_RECONCILIATION`
- `P186_SHADOW_HEALTH_REPORTING`

**No authoritative-mode flag exists.**

## Reconciliation

Read-only comparison across breezy stage, workflow, paperwork, Dropbox, onboarding, MEL-ready, and shadow. Findings only — **no production repairs**.

## Isolation

- No Dropbox send API imports
- No P184 sender imports
- No live mode / continuous automation enablement
- P184/P185 packages not modified

## Next

P186.3 (operator dashboard) only after explicit approval.
