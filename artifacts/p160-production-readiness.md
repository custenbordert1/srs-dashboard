# P160 — Production Readiness & Deployment Center

Generated: 2026-07-07T19:36:57.193Z

## Overall Readiness Score

**81/100**

**Recommendation:** Ready for observation mode

Infrastructure and integrations healthy. Deploy to server, run dry cycles, observe manual batches via P159 before enabling continuous polling.

## Infrastructure

- Build: **Ready** — Production build present (BUILD_ID wUKu2gTR0ukrBCmLuziEQ).
- Node: **v24.15.0** (compatible)
- Runtime health: **Ready**
- Server: Node 20+ compatible with Next.js 16 — suitable for Linux PM2/systemd deployment.

### Secrets

- **Breezy API token**: Ready — BREEZY_API_KEY configured.
- **Dropbox Sign API key**: Ready — DROPBOX_SIGN_API_KEY configured.
- **Session secret**: Ready — Auth secret available.

## Integrations

Overall: **Warning**

- **Breezy API**: Ready — Breezy API reachable (194 published jobs).
- **Dropbox Sign API**: Ready — DROPBOX_SIGN_API_KEY configured.
- **Workflow store**: Ready — Workflow store readable (597 records).
- **Candidate ingestion**: Ready — Ingestion store fresh (20 positions scanned).
- **Recruiter assignment engine**: Ready — 10 canonical recruiters configured.
- **Webhook listeners**: Ready — Dropbox Sign webhook route registered at /api/dropbox-sign/webhook (passive listener).
- **Audit logging**: Ready — Audit stores readable (P145: 500, P151: 500 events).
- **MEL**: Warning — No live MEL API integration — candidates reach MEL via workflow status (Ready for MEL / Loaded in MEL). Manual load process required.
- **Audit store**: Ready — P145 paperwork audit readable (500 events). Workflow + runner audit JSONL on disk.

## Automation Readiness

Overall: **Warning**

### P154 Controlled Production Autopilot

- Status: **Warning**
- P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED not set — enable on server for live capped cycles.
  - Health: healthy
  - Runner: simulation
  - Autopilot state: active
  - Send cap: 10/cycle
  - Stop on error: true

### P155 Operations Dashboard

- Status: **Ready**
- Dashboard operational — runner disabled, 20 sends today.
  - GET /api/recruiting/autopilot/status
  - POST /api/recruiting/autopilot/control

### P156 Candidate Prioritization

- Status: **Ready**
- Prioritization engine scored 93 candidates.
  - GET /api/recruiting/prioritized-queue
  - /executive/recruiting-priorities

### P157 Recruiter Decision Engine

- Status: **Ready**
- 93 decisions generated; 1 Send Paperwork recommendations.
  - GET /api/recruiting/recommended-actions
  - /executive/recruiting-decisions

### P158 Recruiter Assignment (+ P158.1–P158.3)

- Status: **Ready**
- Assignment, simulation, diagnosis, and transition modules operational (read-only).
  - P158 assignment queue: 52 items
  - P158.1 simulation: 25 would assign
  - P158.2 diagnosis: 25 candidates
  - P158.3 transition: 25 eligible

### P159 Operations Control Center

- Status: **Ready**
- Control center live — mode manual_only, 40 sends today, recommendation: safe_for_capped_cycle.
  - GET /api/recruiting/operations-control-center
  - POST /api/recruiting/operations-control-center/control
  - /executive/operations-control-center

## Safety Checklist

Overall: **Ready**

- **Duplicate protection**: Ready — P152 hard blockers + onboarding duplicate checks active on every send.
- **Rollback procedures**: Ready — P158 assignment rollback + P158.3 transition rollback + autopilot pause documented.
- **Audit logging**: Ready — P145 paperwork audit, P151 pipeline audit, workflow audit JSONL, P154.7 runner audit.
- **Stop-on-error**: Ready — P154_STOP_ON_ERROR active — cycle halts on first failure.
- **Overlap lock**: Ready — P154.7 file-based lock with 15-minute stale detection prevents concurrent cycles.
- **Per-cycle caps**: Ready — Send cap 10/cycle, assignment cap 25/cycle.
- **Feature flags (safe defaults)**: Ready — P154_CONTINUOUS_ENABLED=false; P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED=false; P152_IMMEDIATE_PAPERWORK_ENABLED=false; P147_INITIAL_PAPERWORK_AUTO_SEND_ENABLED=false

## Deployment Checklist

Overall: **Blocked**

- [PENDING] Clone repository on company server — git clone + checkout deployment branch.
- [COMPLETE] npm install — node_modules present locally.
- [COMPLETE] npm run build — .next/BUILD_ID present.
- [COMPLETE] Configure environment variables (.env.local) — Required secrets configured in current environment.
- [PENDING] PM2/systemd configuration — Configure process manager for next start + p154.7-continuous-runner --daemon (when approved).
- [PENDING] Continuous runner setup — Intentionally disabled — enable only after observation period.
- [COMPLETE] Health endpoints — GET /api/recruiting/production-readiness, /api/recruiting/operations-control-center, /api/recruiting/autopilot/status.
- [PARTIAL] Post-deploy verification — Run npx tsx scripts/p159-operations-control-center.ts and p160-production-readiness.ts; confirm dry cycle.

## Risk Assessment

### Critical (0)

_None_

### High (0)

_None_

### Medium (1)

- **Manual batch operations required** — Production currently relies on operator-triggered capped cycles, not continuous polling.
  - Mitigation: Use P159 Operations Control Center for each live batch until continuous mode approved.

### Low (2)

- **MEL load is manual** — No automated MEL API — recruiters load signed candidates manually.
  - Mitigation: Document MEL handoff SOP for recruiters.
- **Paperwork queue backlog** — Eligible candidates may wait for next capped cycle (max 10 sends).
  - Mitigation: Run additional manual batches or raise cap after monitoring.

## Validation

- buildPassed: **true**
- p160TestsPassed: **true**
- p159TestsPassed: **true**
- p158TestsPassed: **true**
- p157TestsPassed: **true**
- p156TestsPassed: **true**
- p155TestsPassed: **true**
- p154TestsPassed: **true**
- continuousModeRemainsDisabled: **true**
- daemonNotStarted: **true**
- noWorkflowWrites: **true**
- noRecruiterAssignments: **true**
- noPaperworkSends: **true**
- noBreezyWrites: **true**
- runnerSchedulerMode: **simulation**
- overallReadinessScore: **81**
- recommendation: **ready_for_observation_mode**
- criticalBlockers: **0**

