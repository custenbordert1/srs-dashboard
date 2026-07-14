# P186.1 — Lifecycle State Machine (Shadow Mode)

**Status:** Implemented (shadow-only)  
**Date:** 2026-07-13  
**Does not:** send paperwork, enable live mode, enable continuous automation, modify P184/P185, change schedulers, advance candidates in production, or modify production queues.

---

## Purpose

Introduce a single authoritative **lifecycle state machine** on Neon that **observes** the recruiting pipeline. Production behavior remains unchanged; P186.1 records shadow state + audit and compares it to production-derived expectations.

---

## Components

| Deliverable | Path |
|---|---|
| Types / states | `src/lib/p186-1-lifecycle-state-machine/types.ts`, `states.ts` |
| TransitionValidator | `transitionValidator.ts` |
| LifecycleStateMachine | `lifecycleStateMachine.ts` |
| LifecycleAuditStore / RecordStore | `stores.ts` |
| ShadowProjectionEngine | `shadowProjection.ts` |
| LifecycleHealthReport | `healthReport.ts` |
| Neon schema | `schema.ts`, `migrate.ts` |
| Tests | `__tests__/p186-1-lifecycle-state-machine.test.ts` |
| Shadow runner | `scripts/p186-1-shadow-validation.ts` |

---

## State model

```
Applied
→ Recruiter Review
→ Hiring Recommendation
→ Operator Approved
→ Paperwork Needed
→ Paperwork Sent
→ Viewed (optional)
→ Signed
→ Onboarding Complete
→ Ready for MEL
→ Exported

BLOCKED ↔ recoverable side state (requires reason)
```

Code enums: `APPLIED` … `EXPORTED`, plus `BLOCKED`.

### Legal edges (summary)

- Happy path is forward-only with limited back-edges (`HIRING_RECOMMENDATION → RECRUITER_REVIEW`, `OPERATOR_APPROVED → RECRUITER_REVIEW`).
- `PAPERWORK_SENT → SIGNED` may skip `VIEWED`.
- Initial create allowed only as `APPLIED` (or `BLOCKED`).
- Duplicate `event_id` is rejected and audited.

---

## Neon tables

- `p186_schema_migrations`
- `p186_lifecycle_records` (CAS `version`)
- `p186_lifecycle_audit` (immutable append)
- `p186_processed_events` (idempotency)
- `p186_shadow_findings`
- `p186_shadow_runs`

Reuses P185.5 `createSqlClient` (Neon/PGlite) **without modifying** P184/P185 schemas or bridges.

---

## Shadow mode

For each production (or synthetic) snapshot:

1. `deriveExpectedLifecycleState(...)` from workflow/paperwork facts.
2. Compare to shadow record.
3. Seed/advance shadow only via legal FSM transitions.
4. Record findings: match, mismatch, duplicate, invalid, missing, impossible.

**Never** writes candidate-workflow store, P184 queue, or Dropbox Sign.

---

## Isolation guarantees

- No imports of `sendTemplateSignatureRequest`, `sendP184Paperwork`, or onboarding execute-send.
- Health report hard-codes isolation flags.
- Shadow script deletes `P185_PRODUCTION_AUTOMATION_ENABLED` if present in-process.

---

## Testing coverage

- Legal / illegal transitions
- Duplicate events
- Restart persistence (PGlite)
- Audit replay reconstruction
- Concurrent CAS
- Shadow projection
- Health report
- Static send-module isolation

---

## Next (not started)

**P186.2** — event adapters (Dropbox webhook observe, recruiter/approval commands) behind dual-write flags. Requires explicit approval after P186.1 readiness review.
