# P139 — First Live Pilot Operator Runbook

**Operator:** Taylor  
**Generated:** 2026-07-02T18:38:56.004Z  
**Mode:** runbookOnly (no automatic sends)

---

## Pilot candidate

| Field | Value |
|-------|-------|
| Name | Erica C Portolese |
| Candidate ID | `e72d6aebdb0d` |
| Email | gigizen8@gmail.com |
| Phone | 3152506894 |
| Breezy job/project | In-Store Merchandiser — Massena, NY (Massena, NY) |
| Position ID | dcf114d05f31 |
| Dropbox Sign template | Onboarding Packet (`onboarding_packet`) |
| P124 approval | AUTO_APPROVED |
| Approval score | 93 |

---

## Phase status

### P137 — First Live Send Readiness Gate

- **GO / NO-GO:** GO WITH CONDITIONS
- **Reason:** AUTO_APPROVED candidate selected — enable pilot env vars, operator GO, and confirmation phrase before executeOne.
- **Target candidate matches P137 selection:** P139 designated target — in P137 AUTO_APPROVED cohort

### P138 — Post-send verification (run after P122 executeOne)

- **Overall:** FAIL (expected **FAIL** before live send)
- **Reason:** Verification failed — 6 check(s) did not pass.
- **Note:** Expected before live send — re-run P138 after P122 executeOne completes.

---

## System safety checklist

- [ ] **Live pilot enabled** — PENDING — Set AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true
- [ ] **Live mode enabled** — PENDING — Set AUTONOMOUS_PAPERWORK_LIVE_MODE=true
- [ ] **Operator GO** — PENDING — Set AUTONOMOUS_PAPERWORK_OPERATOR_GO=true
- [ ] **Pilot cap available** — PASS — 0/1 pilot sends used.
- [ ] **dryRun is false** — PENDING — Execution blocked — dryRun default prevents sends.
- [ ] **Confirmation phrase** — PASS — Not required for preview/dry-run.
- [ ] **Pilot allowlist** — PASS — Candidate is on pilot allowlist.
- [ ] **No already_sent record** — PASS — No prior send detected.
- [ ] **No duplicate_risk** — PASS — Duplicate protection clear.
- [ ] **Valid email** — PASS — Email: landrydistribution@yahoo.com
- [ ] **Approved mapping or native project** — PASS — Native published Breezy job match.
- [ ] **Pilot cap available** — PASS — 0/1 pilot sends used.
- [ ] **No executeBatch** — PASS — executeOne only — executeBatch forbidden.
- [ ] **No Breezy writes from automation** — PASS — Taylor verifies in Breezy UI; automation is read-only.
- [ ] **Pilot cap = 1** — PASS — maxSends=1
- [ ] **Live mode disabled by default** — PASS — Live mode off.
- [ ] **Continuous mode disabled** — PASS — Do not enable P125 continuous runner for first pilot.

---

## Human review checklist (Breezy — Taylor)

Verify manually in Breezy before running the live command:

- [ ] **Correct candidate** — expected: `Erica C Portolese` — Open Erica's Breezy profile and confirm name matches exactly.
- [ ] **Correct email** — expected: `gigizen8@gmail.com` — Confirm email on file matches before Dropbox Sign send.
- [ ] **Correct job/project** — expected: `In-Store Merchandiser — Massena, NY (Massena, NY)` — Confirm candidate is on the published Breezy job shown above.
- [ ] **Correct paperwork packet/template** — expected: `Onboarding Packet` — Confirm paperwork template matches onboarding packet for this pilot.
- [ ] **Not already sent** — expected: `not_sent` — Confirm no prior Dropbox Sign request or paperwork-sent status in Breezy.
- [ ] **Not duplicate** — expected: `no duplicate risk` — Confirm no duplicate candidate record or prior send for this person.
- [ ] **Candidate ready for paperwork** — expected: `Paperwork Needed / ready` — Confirm questionnaire/resume complete and recruiter assigned if required.

---

## Terminal commands

Run from the project root: `/Users/tayloecustenborder/Documents/GitHub/srs-dashboard`

### 1. Pause scheduler (recommended before live send)

```bash
npx tsx -e "import { pauseScheduler } from './src/lib/p136-autonomous-paperwork-scheduler/scheduler-controls.ts'; pauseScheduler().then((s) => console.log(JSON.stringify({ schedulerMode: s.schedulerMode, schedulerStatus: s.schedulerStatus }, null, 2)))"
```

### 2. Enable pilot env vars (one candidate only)

```bash
export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true
export AUTONOMOUS_PAPERWORK_LIVE_MODE=true
export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true
export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="e72d6aebdb0d"
export AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS=1
```

### 3. Allowlist Erica only

```bash
export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="e72d6aebdb0d"
```

### 4. Execute first live send (P122 executeOne — Taylor runs after Breezy review)

```bash
npx tsx scripts/p122-controlled-live-paperwork-pilot.ts --execute --confirm "SEND 1 PAPERWORK PACKET" --candidate-id e72d6aebdb0d
```

### 5. Verify send and apply safety lock (P138)

```bash
npx tsx scripts/p138-first-live-send-verification.ts --candidate-id=e72d6aebdb0d
```

### 6. Disable live env vars afterward

```bash
export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=false
export AUTONOMOUS_PAPERWORK_LIVE_MODE=false
export AUTONOMOUS_PAPERWORK_OPERATOR_GO=false
export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST=""
```

---

## Rollback / stop instructions

### Confirm no second send

- Run P138 verification — expect overallResult PASS and pilotLockStatus Locked after first send.
- Check pilot registry: `.data/p122-controlled-live-paperwork-pilot-registry.json` — sendCount must be 1.
- Confirm only one audit entry with outcome "sent" for e72d6aebdb0d.
- Re-run P122 live command — must NOT send again (pilot cap / duplicate guard).

### Clear allowlist

- export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST=""
- export AUTONOMOUS_PAPERWORK_OPERATOR_GO=false
- export AUTONOMOUS_PAPERWORK_LIVE_MODE=false
- export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=false
- P138 safety lock also records required env lockdown — follow artifact recommendations.

### Pause scheduler

- Before live send: pause P136 scheduler (command in Terminal Commands section).
- POST /api/autonomous-paperwork-scheduler/pause (executive auth) if dashboard is running.
- Do not start continuous mode or P125 continuous runner for this pilot.

### Verify duplicate protection

- npx tsx scripts/p138-first-live-send-verification.ts --candidate-id=e72d6aebdb0d
- Expect duplicateVerification.wouldBlockResend=true after successful send.
- grep "e72d6aebdb0d" .data/p100-controlled-live-send-state.json — candidate in sentCandidateIds.

### Confirm audit record

- tail -5 /Users/tayloecustenborder/Documents/GitHub/srs-dashboard/.data/p100-controlled-live-send-audit.jsonl
- grep "e72d6aebdb0d" /Users/tayloecustenborder/Documents/GitHub/srs-dashboard/.data/p100-controlled-live-send-audit.jsonl — expect outcome "sent", mode "executeOne".
- Workflow should show actionType=await-signature and paperworkStatus=sent.
- Dropbox Sign signatureRequestId stored on workflow record.

---

## Safety invariants

- **executeBatch:** forbidden — use executeOne only
- **Breezy writes:** none from automation — Taylor verifies in Breezy UI only
- **Pilot cap:** 1 send maximum
- **Continuous mode:** do not enable
- **P122** is the only component that may call executeOne

---

*This runbook does not send paperwork. Taylor executes the live command manually after completing the Breezy review checklist.*
