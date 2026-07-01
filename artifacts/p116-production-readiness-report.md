# P116 — Autonomous Paperwork Production Readiness Audit

**Generated:** 2026-07-01  
**Mode:** Read-only audit (no code or production behavior changes)  
**Scope:** Post P106–P115 autonomous paperwork system

## Audit question

> If we enabled live `executeOne` today, what would still prevent this system from operating safely **without manual intervention**?

## Final recommendation: **GO WITH CONDITIONS**

Safety architecture is mature enough for **controlled, operator-supervised** live sends, but **not** for unattended production automation. Enabling `executeOne` today would still leave the majority of closed-ad candidates blocked, would **not** honor P113/P114 recruiter mapping approvals in the live runner path, and would still require executive gates (P97/P99/P84/P101) before each send.

**Conditions before broad live operation:**

1. Wire P109 approved mappings into the P106.3 `classifyPaperworkBlocker` / closed-ad path (with protection order preserved).
2. Clear or triage mapping backlog (121+ pending; 6 REVIEW FIRST bulk groups / 30 candidates per P115).
3. Achieve P101 operator checklist **GO** with P99 readiness and P84 live flags explicitly enabled.
4. Add production monitoring and alerting (runner health, send failures, ingestion staleness).
5. Validate Dropbox Sign and rollback procedures in the target environment.

---

## Part 1 — Architecture review

### Pipeline trace

```
Breezy Applicant
    ↓  breezy-api, scanBreezyPublishedPositionsBatch
Candidate Ingestion
    ↓  candidate-ingestion → ingestion store + workflow backfill
Paperwork Classification
    ↓  p106 classify-paperwork-blocker (ordered protection gates)
Project Mapping (analysis)
    ↓  p108-intelligent-project-mapping (weighted scoring, review queue)
Closed-Ad Recovery (production path)
    ↓  closed-ad-project-mapping (title/city/state heuristics)
Approval Bridge (local only)
    ↓  p109–p115 (.data decisions; NOT consumed by runner today)
Runner Selection
    ↓  autonomous-paperwork-runner/select-candidates-for-runner
Runner Execution
    ↓  run-autonomous-paperwork-runner (file lock, optional schedule)
executeOne
    ↓  p106 engine → controlled-live-send (max 1 send/run)
Dropbox Sign
    ↓  execute-onboarding-send
Audit Logging
    ↓  .data/p97-*.jsonl, .data/p100-*.jsonl, runner audit
Ready For Onboarding
    ↓  workflow + onboarding reconciliation
```

### Critical integration gap

**P109 recruiter approvals are not wired into the live P106.3 runner.**

- `classify-paperwork-blocker.ts` calls `resolveClosedAdProjectMapping` only.
- No imports of `loadP109ReviewRecords` or `resolveApprovedMapping` exist under `p106-autonomous-paperwork-engine` or `closed-ad-project-mapping`.
- P110–P115 prove approvals unlock eligibility **in dry-run simulation only**.
- P113/P114 approved **6 candidates** locally; the runner would still classify many of the same closed-ad cohort as `project_not_mappable` or `project_mapping_review` without the P110 overlay.

### Key dependencies

| Layer | Depends on |
|-------|------------|
| Ingestion | Breezy API, `.data` ingestion store, workflow store |
| Classification | Jobs maps (published/closed), onboarding, P100 sent IDs |
| P108 mapping | MEL opportunities, historical patterns, Breezy jobs |
| P106 closed-ad | Published job list, title normalization |
| P109 approvals | Local `.data/p109-project-mapping-review-decisions.json` |
| Runner | Env flags, file lock, Breezy sync |
| Live send | P97 audit/rollback, P99 approval, P84 flags, P100 locks |
| Dropbox Sign | API credentials, template registry |

---

## Part 2 — Safety review

| Protection | Status | Notes |
|------------|--------|-------|
| `duplicate_risk` | ✓ Present | Before mapping and send |
| `already_sent` | ✓ Present | P100 state + workflow status |
| `invalid_email` | ✓ Present | Early in classifier chain |
| `project_not_mappable` | ✓ Present | Closed-ad heuristic failure |
| `project_mapping_review` | ✓ Present | Medium-confidence closed-ad match |
| `unpublished_job` | ~ Partial | In types/metrics; often folded into `project_not_mappable` |
| Audit logging | ✓ Present | P97/P100 JSONL (local only) |
| dryRun protections | ✓ Present | Default mode everywhere |
| executeOne isolation | ✓ Present | `maxSends = 1`; no executeBatch in P106.3 |
| Operator checklist | ✓ Present | P101 API + executive panel |
| Approval bridge | ~ Partial | P109 bridge exists; **not in runner** |
| Local approval storage | ✓ Present | Single-node `.data` |
| Runner scheduling | ✓ Present | Off unless `AUTONOMOUS_PAPERWORK_RUNNER_SCHEDULE_ENABLED=true` |
| Environment flags | ✓ Present | Live mode null in all P109–P115 runs |

### Missing or weak protections

1. **P109 → runner integration** (Critical) — approved mappings ignored in live path.
2. **Production alerting** (High) — no automated notification on failures.
3. **Audit replication** (Medium) — local JSONL only.
4. **Dual mapping engines** (Medium) — P106 vs P108 can disagree.
5. **Overlay vs full eligibility** (Medium) — mapping approval ≠ send-ready (`missing_resume`, `p84_gate_failed` may remain).

---

## Part 3 — Production blockers

### Critical

| Blocker | Risk if ignored | Solution | Effort |
|---------|-----------------|----------|--------|
| P109 not wired to runner | Approved mappings don't unblock sends | Integrate `resolveApprovedMapping` into classifier behind flag | 3–5 days |
| Mapping backlog (121+ pending, 30 in REVIEW FIRST groups) | Manual triage never ends | Recruiter review + reject/skip low-confidence groups | 1–2 weeks |
| Executive gates not cleared | Uncontrolled live send | P101 GO, P99, P84 explicit enablement | 1 session + validation |

### High

| Blocker | Risk | Solution | Effort |
|---------|------|----------|--------|
| Dual mapping engines (P106 vs P108) | Wrong bulk/recruiter decisions | Unify or document authoritative engine | 5–8 days |
| No production monitoring | Silent failures | Alerting on runner/send/ingestion | 2–4 days |
| Single-node `.data` state | Data loss / split brain | Single-runner deploy or migrate state | 1–2 weeks |

### Medium / Low

- Post-mapping gates (`missing_resume`, P84) still block after approval — improve UI clarity (2–3 days).
- Breezy sync warnings don't halt live cycles — hard-fail in live mode (1–2 days).
- Experimental scripts (`p102-execute-one-live-send.ts`) — document canonical runbook (0.5–1 day).

---

## Part 4 — Operational readiness

**Can recruiters realistically operate this today?** **No — not without heavy manual intervention.**

| Area | Status |
|------|--------|
| Project mapping workflow | PARTIAL — UI exists; large backlog |
| Bulk approvals | PARTIAL — 6 SAFE approvals done; 30 borderline blocked (P115) |
| Individual approvals | COMPLETE — P109 store works (local) |
| Executive visibility | PARTIAL — many panels; no single readiness view |
| Monitoring | NOT READY |
| Failure recovery | PARTIAL — P97 rollback local |
| Rollback plan | PARTIAL — not prod-validated |
| Alerting | NOT READY |
| Audit trail | PARTIAL — local JSONL |

**Evidence from phase artifacts:**

- P110: 6 approved mappings, **20** need review, **305** not approved, **24** `already_sent` exclusions.
- P115: **6** REVIEW FIRST groups, **30** candidates, bulk approval **NO-GO**, **0** splittable SAFE subgroups.

---

## Part 5 — Code quality review

- **625 tests / 141 suites** — all passing at audit time.
- **Duplicate logic:** P106 closed-ad heuristics vs P108 weighted scoring.
- **~50 phase scripts** (`p6x`–`p11x`) — validation tooling, not production entrypoints.
- **Temporary files:** `dropbox-sign-debug.ts`, `candidates-client-trace.ts`.
- **Large generated artifacts** in-repo (p111–p115) — fine for phase work; consider CI-only for production branch.

**Cleanup before production:**

1. Consolidate or document mapping engine ownership.
2. Archive experimental scripts.
3. Remove temporary debug modules.
4. Add repeatable P116 audit to release checklist.

---

## Part 6 — Live readiness scores

| Dimension | Score | Summary |
|-----------|-------|---------|
| Architecture | **72** | Clear pipeline; integration gap at P109→P106 |
| Reliability | **58** | Local state, limited observability |
| Safety | **86** | Strong protection order and executeOne isolation |
| Automation | **44** | Heavy manual mapping and executive gates |
| Operational readiness | **51** | UI exists; backlog and alerting gaps |
| Code quality | **67** | Good tests; phase sprawl and duplicate mapping |
| **Overall** | **58** | Pilot-ready with operators; not production-unattended |

---

## Part 7 — Production go-live checklist

| Item | Status |
|------|--------|
| Environment variables configured | PARTIAL |
| Runner schedule enabled | NOT READY |
| Live executeOne enabled | NOT READY |
| Operator checklist approved (P101 GO) | NOT READY |
| Mapping approvals complete for cohort | NOT READY |
| P109 → P106 runner integration verified | NOT READY |
| Monitoring enabled | NOT READY |
| Rollback plan verified | PARTIAL |
| Dropbox Sign validated | PARTIAL |
| Audit logging verified | PARTIAL |
| Executive dashboard verified | PARTIAL |
| Protection order tests passing | COMPLETE |
| executeBatch disabled in production | COMPLETE |
| REVIEW FIRST bulk groups triaged | NOT READY |

---

## Part 8 — Final recommendation

### **GO WITH CONDITIONS**

The system is **safe to continue dry-run operation** and **safe for controlled `executeOne` pilots** when an operator follows P101 and executive gates. It is **not ready** to enable live `executeOne` broadly today without manual intervention because:

1. **Recruiter mapping approvals do not reach the live classifier** — the largest automation gap after P106–P115.
2. **Mapping backlog remains large** — automation cannot clear closed-ad blockers at scale.
3. **Executive and P84 gates are intentionally manual** — by design, not a bug.
4. **No production monitoring or alerting** — failures would not surface without an operator watching dashboards.

**Do not enable** `AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE=executeOne` or scheduled live runner until P109 integration is complete, target cohort mapping is approved, P101 is GO, and monitoring is in place.

---

## Validation

| Check | Result |
|-------|--------|
| `npm test` | ✓ 625 passed |
| `npm run build` | ✓ Passed |
| Code changes | None (read-only audit) |
| Sends / Breezy writes / live mode | None |

Structured data: `artifacts/p116-production-readiness-audit.json`
