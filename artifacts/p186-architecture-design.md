# P186 — Autonomous Recruiting Lifecycle Orchestrator

**Phase:** Architecture & implementation planning only (no code in this phase)  
**Date:** 2026-07-13  
**Status:** Design recommendation — awaiting approval to implement  
**Depends on:** P184/P185 paperwork automation (production proven)

---

## 1. Executive summary

P186 should become the **single authoritative recruiting lifecycle control plane**: one lifecycle state per candidate, one transition API, one reconciliation scheduler, and explicit event adapters for Breezy (pull), Dropbox Sign (webhook), recruiter actions, and operator approvals.

It must **not** become another competing orchestrator. The repo already has overlapping stacks (P74, P148, P154, P169, P171, plus P184/P185 for paperwork). P186’s job is to **consolidate and govern**, not add a sixth advancement engine.

### Non-negotiable safety constraints

| Constraint | Rule |
|---|---|
| Paperwork isolation | Live sends remain **only** via P184 (eligibility/idempotency/rate limits) under P185 (lease/circuit/gates). |
| No continuous sending | P186 never sets `P185_PRODUCTION_AUTOMATION_ENABLED` or flips P184 to `live` autonomously. |
| No automatic paperwork release | Paperwork Queue → Sent requires **operator approval** + existing P185 frozen/canary/backlog gates (or a future explicit batch auth). |
| No approval bypass | No path may write `Paperwork Needed` / enqueue live send without recorded operator/executive approval evidence. |
| No second Sign webhook | Extend existing Dropbox Sign webhook → lifecycle events; do not fork write paths. |

### Recommended posture

**Extend and promote P171 + candidate-workflow store into P186**, with P169 outcomes as the decision adapter and P159/P154 demoted to execution backends behind a single scheduler. Retire or freeze competing writers gradually.

---

## 2. Current-state findings (code facts)

### What already exists

1. **Candidate workflow SoR (partial):** `candidate-workflow-types.ts` / `candidate-workflow-store.ts` — statuses include Applied → Paperwork Needed/Sent → Signed → Ready for MEL → Loaded in MEL. Still **filesystem JSON**, not Neon.
2. **Parallel FSM:** P171 lifecycle states (`NEW`…`READY_FOR_MEL`…`EXCEPTION`) mapped from workflow + P157 — separate JSON state file.
3. **Decision layer:** P157 → P169 outcomes (`AUTO_SEND_PAPERWORK`, `READY_FOR_MEL`, …) gated by P167/P168.
4. **Execution:** P159 operations control → P154 cycles; P185 cron → P184 sends.
5. **Signature truth:** Dropbox Sign webhook (+ P107 monitor reconciliation) writes viewed/signed into workflow store.
6. **Paperwork durability:** P185.5 Neon (queue, leases, envelopes, idempotency, audit) — **paperwork-scoped only**.
7. **Breezy:** pull ingestion only — **no Breezy webhook route**.
8. **MEL:** status signals only — **no live MEL export API**.

### Critical gaps P186 must close

| Gap | Risk if ignored |
|---|---|
| Multiple advancement writers (P83, P158.3, progression, P151, automation, UI) | Race conditions, duplicate transitions, audit holes |
| Dual lifecycle models (workflow status vs P171 FSM) | Operator confusion; “authoritative state” undefined |
| Competing schedulers (P154 daemon, P169 7m, P171 15m, P185 10m) | Overlapping sends/monitor cycles if enabled together |
| Workflow store not on Neon | Serverless restart / multi-instance inconsistency |
| MEL export missing | “Ready for MEL” dead-ends into manual process |
| Event-driven Breezy missing | Latency and missed applications until pull sync |

---

## 3. Target architecture

### 3.1 Principle: one control plane

```
                    ┌─────────────────────────────────────────┐
                    │           P186 Lifecycle Engine          │
                    │  (authoritative state + transition API)  │
                    └───────────────┬─────────────────────────┘
                                    │
         ┌─────────────┬────────────┼────────────┬──────────────┐
         ▼             ▼            ▼            ▼              ▼
   Event Bus      Transition     Audit Log    Projection     Scheduler
   Adapters         Guard         (append)     Read Models    (single)
         │             │            │            │              │
         │             └────────────┴────────────┘              │
         │                                                      │
    ┌────┴─────┐                                         ┌──────┴──────┐
    │ Sources  │                                         │ Side effects│
    ├──────────┤                                         ├─────────────┤
    │ Breezy   │ (pull/webhook adapter)                  │ Workflow SoR│
    │ Dropbox  │ (existing webhook only)                 │ Queue hints │
    │ Recruiter│ (UI/API actions)                        │ MEL export  │
    │ Operator │ (approval queues)                       │ Notify/UI   │
    │ Reconcile│ (scheduled)                             │ P185 *hint* │
    └──────────┘                                         └─────────────┘

Paperwork send boundary (HARD WALL):
  P186 may enqueue *intent* / mark Paperwork Queue
  → Operator approval required
  → P185 frozen/batch auth (existing)
  → P184 live send only inside authorized window
  → P184 returns dry_run; P186 never enables continuous automation
```

### 3.2 Component boundaries

| Component | Responsibility | Must not do |
|---|---|---|
| **P186 Lifecycle Engine** | Authoritative state, legal transitions, audit, projections | Call Dropbox Sign send APIs |
| **Event Adapters** | Normalize inbound events → commands | Mutate workflow status directly |
| **Transition Guard** | Idempotent apply(command) with CAS | Skip approval for hire→paperwork |
| **Reconciliation Worker** | Heal missed webhooks / drift | Resend paperwork |
| **Operator Dashboard** | Queues + bulk approve/block | Bypass guard |
| **Executive Dashboard** | Funnel/metrics | Trigger live sends |
| **P184/P185** | Paperwork send/reconcile only | Own full recruiting lifecycle |
| **MEL Export Adapter** | Export when Ready for MEL + docs complete | Invent hire decisions |

### 3.3 Data model (recommended)

**Authoritative table (Neon, new P186 schema alongside P185.5):**

`p186_lifecycle_records`
- `candidate_id` PK
- `state` (see §4)
- `previous_state`
- `updated_at`, `version` (CAS)
- `blocked_reason` nullable
- `approval_ref` nullable (operator/exec evidence id)
- `paperwork_envelope_hash` nullable
- `mel_export_status` (`not_queued` \| `queued` \| `exported` \| `failed`)
- `health_score` cached int
- `payload` JSONB (non-PII operational metadata)

`p186_lifecycle_transitions` (append-only audit)
- `id`, `candidate_id`, `at`, `actor`, `source`, `from_state`, `to_state`, `reason`, `correlation_id`, `detail` JSONB

`p186_event_inbox` (durable inbound events)
- `event_id` PK (idempotent), `source`, `received_at`, `processed_at`, `payload_hash`, `status`

`p186_mel_export_queue`
- `candidate_id`, `queued_at`, `attempts`, `last_error`, `status`

**Projection / read models** (materialized periodically or on transition):
- Operator queue counts
- Funnel metrics daily rollups

**Bridge:** Keep `candidate-workflow-store` as a **projection** updated by P186 transitions during migration; eventually make Neon authoritative and FS a cache.

---

## 4. Lifecycle state machine

### 4.1 Canonical states (P186)

Align product language with the requested pipeline while mapping cleanly onto existing workflow statuses:

| P186 state | Operator meaning | Maps to workflow status (today) |
|---|---|---|
| `APPLIED` | New application ingested | `Applied` |
| `RECRUITER_REVIEW` | Waiting on recruiter | `Needs Review` / `Qualified` (review lane) |
| `HIRING_RECOMMENDATION` | System/recruiter recommend hire | (overlay / recommendedStage) |
| `AWAITING_OPERATOR_APPROVAL` | Explicit approval gate | (approval queue; not yet Paperwork Needed) |
| `PAPERWORK_QUEUE` | Approved; waiting authorized send | `Paperwork Needed` |
| `PAPERWORK_SENT` | Packet sent & confirmed | `Paperwork Sent` |
| `PAPERWORK_VIEWED` | Signer viewed | `Paperwork Sent` + paperworkStatus `viewed` |
| `PAPERWORK_SIGNED` | Signature complete verified | `Signed` |
| `ONBOARDING_COMPLETE` | Required docs verified | `Signed` / DD gates as policy |
| `READY_FOR_MEL` | Eligible for MEL load | `Ready for MEL` |
| `EXPORTED_TO_MEL` | Export succeeded | `Loaded in MEL` |
| `BLOCKED` | Soft-stop with reason | hold / exception |
| `TERMINAL_REJECTED` | Not hired / withdrawn | `Not Qualified` (+ archive rules) |

`PAPERWORK_VIEWED` is a **lifecycle substate** of outstanding paperwork (still paperwork-outstanding for ops), not a regression from signed.

### 4.2 Legal transitions (forward-only except BLOCKED)

```
APPLIED
  → RECRUITER_REVIEW          [breezy_ingest | recruiter_claim]
RECRUITER_REVIEW
  → HIRING_RECOMMENDATION     [recruiter_recommend | p157_recommend]
  → TERMINAL_REJECTED         [recruiter_reject]
  → BLOCKED                   [hold]
HIRING_RECOMMENDATION
  → AWAITING_OPERATOR_APPROVAL[submit_for_approval]
  → RECRUITER_REVIEW          [request_more_info]  // limited backward
  → BLOCKED
AWAITING_OPERATOR_APPROVAL
  → PAPERWORK_QUEUE           [operator_approve]   // REQUIRED evidence
  → RECRUITER_REVIEW          [operator_deny]
  → BLOCKED
PAPERWORK_QUEUE
  → PAPERWORK_SENT            [p185_confirmed_sent event only]
  → BLOCKED                   [eligibility_fail | hold]
  // NO direct jump to SENT from P186 send API
PAPERWORK_SENT
  → PAPERWORK_VIEWED          [dropbox_viewed]
  → PAPERWORK_SIGNED          [dropbox_signed]     // viewed optional
  → BLOCKED                   [declined | expired | failed]
PAPERWORK_VIEWED
  → PAPERWORK_SIGNED          [dropbox_signed]
  → BLOCKED
PAPERWORK_SIGNED
  → ONBOARDING_COMPLETE       [docs_verified]      // never skip missing docs
ONBOARDING_COMPLETE
  → READY_FOR_MEL             [mel_ready_check]
READY_FOR_MEL
  → EXPORTED_TO_MEL           [mel_export_success]
  → BLOCKED                   [mel_export_fail]    // recoverable
BLOCKED
  → <prior or RECRUITER_REVIEW>[operator_unblock]
```

### 4.3 Invariants

1. **One state per candidate** in `p186_lifecycle_records`.
2. Transitions are **idempotent** on `(candidate_id, event_id)`.
3. `PAPERWORK_QUEUE → PAPERWORK_SENT` only from **P185 confirmed_sent** (or webhook-confirmed envelope already recorded by P184 path) — never from a raw “send now” button that skips P184.
4. `PAPERWORK_SIGNED → ONBOARDING_COMPLETE` requires document checklist pass.
5. Duplicate Dropbox events do not re-enter earlier states.
6. Audit row required for every successful transition (same transaction / CAS version bump).

---

## 5. Event-driven orchestration

### 5.1 Event sources

| Source | Today | P186 adapter |
|---|---|---|
| Breezy | Pull ingestion sync | `BreezyIngestAdapter` emits `application_upserted`; optional future webhook if Breezy supports it |
| Dropbox Sign | Existing webhook | Wrap handler to also emit `paperwork_viewed` / `paperwork_signed` / `declined` into event inbox **after** existing workflow writers (or replace writers once P186 owns them) |
| Recruiter actions | UI / APIs | Commands: claim, recommend, reject, hold |
| Operator approvals | P97 / P168 / P181 / approval queue | `operator_approve` / `deny` with evidence refs |
| Scheduled reconciliation | Many competing loops | **One** P186 reconciler (+ keep P185 paperwork cron isolated) |

### 5.2 Command processing

```
Event → Inbox (idempotent insert)
     → Command mapper
     → Transition Guard (load version, validate edge, policy checks)
     → Persist state + audit (CAS)
     → Emit side effects (projection update, MEL queue, notifications)
     → Ack inbox
```

Crash recovery: unacked inbox rows reprocessed; side effects must be idempotent.

### 5.3 Paperwork boundary (explicit)

P186 **observes** paperwork; it does not send.

```
Operator approve → PAPERWORK_QUEUE
                 → (optional) add to P185.2/P185.3 eligibility inputs
Authorized human batch / existing P185 gates → P184 live window → confirmed_sent event
                 → P186 PAPERWORK_SENT
```

Continuous automation remains **off**. P186 dashboards may show “ready for authorized batch” but must not auto-release.

---

## 6. Operator dashboard

### 6.1 Queues (primary UX)

| Queue | State filter | Bulk actions |
|---|---|---|
| Waiting on recruiter | `RECRUITER_REVIEW` | Assign, hold, reject |
| Waiting on approval | `AWAITING_OPERATOR_APPROVAL` | Approve, deny, request info |
| Waiting on paperwork send | `PAPERWORK_QUEUE` | Add to review batch (**not** live send) |
| Paperwork outstanding | `PAPERWORK_SENT` / `VIEWED` | Reminder policy (non-send), open Sign status |
| Signed today | `PAPERWORK_SIGNED` (signed_at = today) | Verify docs |
| Onboarding complete | `ONBOARDING_COMPLETE` | Promote to MEL ready |
| Ready for MEL | `READY_FOR_MEL` | Queue export, mark manual loaded |
| Blocked | `BLOCKED` | Unblock, reassign |

### 6.2 Placement

Prefer a dedicated **Lifecycle Operations** executive page that **replaces P171 panel as the primary surface**, with deep links from recruiting tabs. Keep P184/P185 panels as **paperwork subsystem** (collapsed / secondary).

### 6.3 Bulk action rules

- Bulk approve requires confirmation + actor id + evidence note.
- Bulk never includes live Dropbox send.
- Bulk MEL export only for `READY_FOR_MEL` with docs checklist green.

---

## 7. Automatic advancement (post-signature)

When Dropbox reports signed (webhook or reconcile):

1. Verify signature request association to candidate (existing `findCandidateIdBySignatureRequest` / envelope hash).
2. Transition → `PAPERWORK_SIGNED` (idempotent).
3. Run **document completeness** policy (onboarding packet + required DD/HR artifacts as configured).
4. If complete → `ONBOARDING_COMPLETE` → `READY_FOR_MEL`.
5. Enqueue MEL export job (`p186_mel_export_queue`).
6. If incomplete → remain `PAPERWORK_SIGNED` with blocking checklist (not silent advance).

**Never** call P184 send from this path.

---

## 8. Failure recovery

| Failure | Recovery |
|---|---|
| Webhook miss / delay | Reconciler polls Dropbox for outstanding envelopes (reuse P107/P185 reconcile patterns); inbox dedupe |
| Duplicate events | `event_id` unique + state machine ignores no-op |
| Server restart | Neon CAS + lease for reconciler; inbox replay |
| Interrupted MEL export | Queue retry with backoff; state stays `READY_FOR_MEL` until success |
| Lease loss | Worker stops; another instance takes lease |
| Paperwork send failure | Owned by P184/P185; P186 stays in `PAPERWORK_QUEUE` until confirmed_sent |

---

## 9. Audit trail

Every transition persists:

- `timestamp`
- `actor` (`system:dropbox-webhook`, `user:<id>`, `operator:<id>`, `reconciler`)
- `source` (`breezy`, `dropbox_sign`, `recruiter_ui`, `operator_approval`, `reconcile`, `mel_export`)
- `previous_state`, `new_state`
- `reason`
- `correlation_id` / `event_id`

Public artifacts redact PII (same standard as P185.6/P185.7 reports).

---

## 10. Executive dashboard metrics

| Metric | Definition |
|---|---|
| Hiring funnel | Counts by P186 state |
| Conversion rates | Applied→Review, Review→Approval, Approval→Sent, Sent→Signed, Signed→MEL |
| Paperwork aging | Hours in SENT/VIEWED buckets |
| Recruiter performance | Throughput, time-in-review, approve/reject rates |
| Bottlenecks | Largest queue + p50/p90 dwell |
| Avg time in stage | Transition timestamps |
| Daily throughput | Transitions/day by type |
| Candidate health score | Composite: completeness, age, blocked, signature lag (0–100) |

Implement as read models refreshed on transition + nightly rollup — not live full-table scans on every page load.

---

## 11. Implementation plan (phased)

### Milestone breakdown

#### **P186.1 — Lifecycle foundation (Neon + FSM + audit)**
- Schema: lifecycle records, transitions, event inbox
- Transition Guard library + unit tests
- Adapter: migrate/project from existing workflow statuses
- **No UI live sends; no scheduler competition**
- Complexity: **M**

#### **P186.2 — Event adapters (Dropbox + recruiter + approval)**
- Instrument Dropbox webhook → inbox (preserve existing writes initially)
- Recruiter/operator command APIs through Guard only
- Dual-write: P186 state + workflow projection
- Complexity: **M**

#### **P186.3 — Operator lifecycle dashboard**
- Queues + bulk approve/deny/hold
- Blocked management
- Wire to P186 APIs (not P171 state file)
- Complexity: **M**

#### **P186.4 — Single reconciler + decommission competing loops**
- One leased reconciler (Breezy pull drift, Sign outstanding, stuck approvals)
- Feature-flag freeze: P148 cycles, P169 auto-interval, P171 auto-interval when P186 reconciler enabled
- Keep **P185 cron isolated** and disabled unless explicitly authorized for paperwork batches
- Complexity: **L**

#### **P186.5 — Post-sign auto-advance + MEL export queue**
- Docs checklist → Onboarding Complete → Ready for MEL
- MEL export adapter (start with “manual confirmation / CSV handoff” if API absent; design for real API)
- Complexity: **M–L** (depends on MEL integration availability)

#### **P186.6 — Executive analytics**
- Funnel, aging, recruiter performance, health score
- Complexity: **M**

#### **P186.7 — Hard cutover**
- Neon authoritative; FS workflow store becomes cache or deprecated writer
- Remove/disable duplicate advancement apply paths behind flags
- Production certification checklist
- Complexity: **L**

---

## 12. Migration strategy

### Phase A — Shadow mode
- P186 records state from existing workflow + events
- No exclusive ownership; compare drift reports daily
- Success: <1% unexplained drift for 7 days

### Phase B — Dual-write
- All new mutations go through Transition Guard
- Legacy writers emit compatibility events or are wrapped
- Success: zero direct store writes outside Guard for flagged environments

### Phase C — Authoritative cutover
- Read APIs prefer P186 Neon
- Workflow JSON updated only as projection
- Disable P171/P169 interval schedulers; leave manual ops tools

### Phase D — Cleanup
- Delete or archive dead orchestrator entrypoints
- Document single runbook

### Paperwork migration note
**Do not migrate P184/P185 queues into P186.** Keep paperwork durable store as-is; subscribe to its outcomes.

### Prior rollout preservation
Frozen rollout `p1853-20260710-b419512d` remains historical; P186 must treat those 25 as already past `PAPERWORK_SENT`/`VIEWED`/`SIGNED` per reconciliation — never re-queue.

---

## 13. Testing strategy

| Layer | Focus |
|---|---|
| Unit | Transition matrix (legal/illegal), idempotent event apply, CAS conflicts |
| Contract | Webhook → inbox → transition; approval evidence required for PAPERWORK_QUEUE |
| Integration | PGlite/Neon test DB; Dropbox mock; no real sends |
| Property | No transition into PAPERWORK_SENT without confirmed_sent fixture |
| Regression | Existing P184/P185 tests remain green; paperwork isolation suite |
| Chaos | Kill mid-transition; duplicate webhook; lease steal |
| UI | Operator queue counts + bulk approve confirmation |
| Load | Reconciler batch of N outstanding envelopes |

**Hard fail tests:** any code path that calls `sendTemplateSignatureRequest` from P186 modules; any transition skipping operator approval into paperwork queue.

---

## 14. Production rollout strategy

1. **Deploy P186.1–.2 dark** (shadow) on Neon; no UX cutover.
2. **Enable operator dashboard read-only** (P186.3 read).
3. **Enable dual-write** for non-paperwork transitions.
4. **Pilot auto-advance signed→MEL ready** on a small allowlist.
5. **Freeze competing schedulers** behind flags after pilot.
6. **MEL export** pilot (manual confirm first).
7. **Executive metrics** on after data quality sign-off.
8. **Hard cutover** with rollback: re-enable projection-from-workflow if Neon unhealthy.

**Kill switches:** `P186_ENABLED`, `P186_DUAL_WRITE`, `P186_AUTHORITATIVE`, `P186_AUTO_ADVANCE_SIGNED`, `P186_MEL_EXPORT_ENABLED`.  
**Never** couple these to `P185_PRODUCTION_AUTOMATION_ENABLED`.

---

## 15. Estimated complexity

| Area | Estimate | Notes |
|---|---|---|
| FSM + Neon schema + audit | M | Reuse P185.5 client patterns |
| Event adapters | M | Dropbox wrap is delicate |
| Operator UI | M | Can reuse P171 panel patterns |
| Scheduler consolidation | L | Org/process risk > code |
| MEL export | M–L | External dependency |
| Analytics | M | |
| Cutover/cleanup | L | Many legacy writers |
| **Overall P186 program** | **L (multi-sprint)** | ~6–9 milestones as above |

Rough engineering effort if staffed continuously: **4–8 weeks** calendar for P186.1–.6 behind flags; cutover extra.

---

## 16. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Accidental continuous paperwork sends | Critical | Hard wall; isolation tests; P184 stays dry_run by default |
| Approval bypass into Paperwork Queue | Critical | Guard requires evidence ref; audits |
| Dual-write divergence | High | Shadow drift reports; CAS versions |
| Scheduler thundering herd | High | Single lease; disable P169/P171 intervals when P186 on |
| Breaking Dropbox webhook | High | Adapter additive first; contract tests |
| MEL API unavailable | Medium | Queue + manual export status |
| Scope creep into “rewrite recruiting” | Medium | Milestone gates; no P184/P185 refactors except orchestration hooks |
| PII in artifacts/metrics | Medium | Hash IDs; redact emails |

---

## 17. Recommendations (decision asks)

1. **Adopt P186 as the sole lifecycle authority**; treat P171 as the nearest ancestor to evolve, not a peer forever.
2. **Keep P184/P185 unchanged** except thin “emit confirmed_sent/lifecycle hint” hooks if needed.
3. **Do not implement Breezy webhooks in P186.1** unless vendor support is confirmed — start with pull ingest events.
4. **MEL export:** ship queue + manual confirmation in P186.5; real API as P186.5b when credentials exist.
5. **Explicitly freeze** enabling P154 continuous + P169/P171 auto intervals + P185 automation simultaneously.
6. **Authorize implementation starting at P186.1 only** after this design is accepted.

---

## 18. Out of scope for P186

- Changing Dropbox Sign templates or send payload logic
- Re-running P185.7-style live batches without separate operator auth
- Autonomous hire decisions without human approval
- Replacing Breezy as ATS
- Building a second paperwork engine

---

## 19. Architecture diagrams (textual)

### Control-plane vs execution

```
[Operator / Recruiter / Webhooks / Reconciler]
                    │
                    ▼
            [P186 Transition Guard]  ←── sole mutator
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   Neon lifecycle  Audit     Projections
        │
        │ (observe only)
        ▼
   [P185 outcomes] ──confirmed_sent──▶ PAPERWORK_SENT
        ▲
        │ authorized batch only
   [P184 send engine]  (isolated)
```

### State machine (happy path)

```
Applied → Recruiter Review → Hiring Recommendation → Operator Approval
    → Paperwork Queue → Paperwork Sent → Viewed → Signed
    → Onboarding Complete → Ready for MEL → Exported to MEL
```

---

## 20. Next step

Upon approval, implement **P186.1 only**: Neon schema, Transition Guard, shadow projection from existing workflow statuses, and isolation tests — still **no live paperwork automation enablement**.
