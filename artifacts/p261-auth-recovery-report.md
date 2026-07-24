# P261 — Authentication Recovery & Signed-In Job Command Center Validation

**Generated:** 2026-07-23  
**Runtime:** local Next.js 16.2.6 (Turbopack) on `http://localhost:3000`  
**Scope:** Repair `/login` HTTP 500, restore authenticated access, complete signed-in P259/P260 verification. **No paperwork packets created.**

## Four verdicts

| # | Gate | Verdict | Why |
|---|------|---------|-----|
| 1 | Authentication | **GO** | `/login` returns HTTP 200; form renders; valid login establishes `srs_session` (HttpOnly, SameSite=lax); invalid login returns 401; protected routes redirect to `/login?next=…`; no redirect loop. |
| 2 | P259 signed-in operations UI | **GO** | Signed in as executive; Job Management → View → Operations loads applicants scoped to the selected Breezy job (Conroe TX `df0014216e94`, 4 applicants); filters, Review drawer (eligibility + hiring score), Open Breezy / Open Dropbox actions present; confirm-gated writes verified via API. |
| 3 | P260 signed-in paperwork workflow | **GO** | Preview/confirm UI opens with eligibility blocked shown; production API preview + send fail closed (`canSend=false`, HTTP 409 on send); **0** Dropbox packets; **0** Paperwork Sent stage changes from this phase’s blocked send. |
| 4 | Actual live send (quota 0) | **NO-GO** | Production Dropbox Sign `api_signature_requests_left` = **0**. Fail-closed abort. Do not use testMode as substitute. |

## Phase 1 — Reproduce `/login` 500

| Item | Result |
|------|--------|
| URL | `http://localhost:3000/login` |
| HTTP | **500** (before fix) |
| Overlay | Next.js runtime / Turbopack chunk error |
| Root error | `the chunking context (unknown) does not support external modules (request: node:fs/promises)` |
| Failing module | `src/lib/candidate-onboarding-engine/onboarding-record-store.ts` (and related stores) pulled into **Client Component Browser** graph |
| Import chain | `job-command-center-panel.tsx` → `p258-hiring-workspace` → `eligibility.ts` → `build-paperwork-send-eligibility.ts` → `onboarding-send-packet-sync.ts` → `node:fs` stores |
| Why `/login` failed | Turbopack compilation error poisoned the whole DevServer (`getCompilationErrors`), so public routes including `/login` returned 500 |
| Scope | **Local** reproduction (same runtime as P259/P260). Not a SESSION_SECRET / Neon Auth / middleware loop failure. |

### Env presence (nonsecret)

| Variable | Local `.env.local` | Vercel Preview | Vercel Production |
|----------|--------------------|----------------|-------------------|
| `SESSION_SECRET` | PRESENT | PRESENT (Encrypted) | PRESENT (Encrypted) |
| `BREEZY_API_KEY` | PRESENT | PRESENT | PRESENT |
| `DATABASE_URL` | PRESENT | PRESENT | PRESENT |
| `DROPBOX_SIGN_API_KEY` | PRESENT | (not listed in `vercel env ls` sample head; local PRESENT) | — |
| `DROPBOX_SIGN_TEST_MODE` | MISSING (unset → production path forced by P260 preflight) | — | — |
| `DM_DEFAULT_PASSWORD` | MISSING (app default used for seeded users) | — | — |

No secret values recorded.

## Phase 2 — Root cause

**Server/client component misuse via transitive imports**, not auth configuration.

Client UI (`job-command-center-panel.tsx`) imported hiring-workspace eligibility that called `buildPaperworkSendEligibility`, which imported `duplicatePaperworkSendBlockReason` from `onboarding-send-packet-sync.ts`. That module also imported durable Node `fs` stores. Turbopack then failed to generate client chunks for `node:fs/promises`, and the resulting compilation error blocked **all** pages in the shared local runtime — including `/login`.

Not caused by: missing `SESSION_SECRET`, Neon Auth, middleware redirect loop, cookie parsing, or DB connectivity for the login page itself.

## Phase 3 — Smallest safe fix

1. Extract pure `duplicatePaperworkSendBlockReason` to `src/lib/onboarding-send-packet-duplicate.ts` (no `fs`).
2. Re-export from `onboarding-send-packet-sync.ts` for backward compatibility.
3. Point `build-paperwork-send-eligibility.ts` at the pure module.

**Eligibility / packet / quota rules unchanged.**

### Login results (after fix)

| Check | Result |
|-------|--------|
| `GET /login` | **200**, “Sign in” form renders |
| Invalid password | **401** `{ ok:false, error:"Invalid email or password" }` — no session cookie |
| Valid executive login | **200** `{ ok:true, role:"executive", redirect:"/" }` + `Set-Cookie: srs_session=…; HttpOnly; SameSite=lax` |
| `GET /` without cookie | **307** → `/login?next=%2F` |
| `GET /` with session | **200** dashboard |
| Bad cookie | **307** → `/login?next=%2F` |
| Session API | authenticated `true` when cookie present; `false` when absent |
| Browser | Form login succeeded; landed on `/` with Sign out visible |

## Phase 4 — Signed-in P259 validation

| Check | Result |
|-------|--------|
| Job Management | Loads (Breezy live, 328 jobs) |
| View → Operations | Opens Candidate Operations Engine panel |
| Scoping | Conroe TX job `df0014216e94` shows **4 applicants** matching catalog count |
| Filters | Quick filters rendered (Only Ready, Needs Recruiter, …) |
| Review drawer | Opens; Eligibility + hiring score factors visible |
| Scores | Hiring score displayed (e.g. 70) |
| Open Breezy / Open Dropbox | Action buttons present per applicant |
| Read-only actions | Review / History / Copy — no unexpected writes observed |

### Confirmed reversible writes (API, candidate `22072d81bbfd`)

| Action | Result | Notes |
|--------|--------|-------|
| Assign Recruiter | **200** → `P261 Test Recruiter` | Single write |
| Assign DM | **200** → `P261 Test DM` | Single write |
| Move Stage | **200** → `Needs Review` | First attempt with invalid `"Phone Screen"` correctly rejected; valid status succeeded |
| Restore | Durable file restore to original recruiter/DM/stage | Equal-priority ownership merge blocks API restore of same-priority manual recruiter; disk restore completed (`restored: true`) |

Audit: workflow API writes go through `auditFromSession` / workflow history. No unrelated candidates modified for these writes.

Evidence: `artifacts/p261-write-validation.json`, screenshots `artifacts/p261-operations-applicants.png`.

## Phase 5 — Signed-in P260 fail-closed

| Check | Result |
|-------|--------|
| Send Paperwork UI | Confirm → preview path; eligibility **Blocked** shown; Cancel used (no send) |
| Production preflight (lib) | `accountQuotaRemaining: 0`, `testMode: false`, `aborted: true` |
| API `mode=preview` | `ok:true`, `canSend:false`, quota **0**, blockers include quota 0 |
| API `mode=send` | **409**, `aborted:true`, `signatureRequestId:null`, **packetsCreated:0** |
| Workflow Paperwork Sent from blocked send | **None** |
| testMode substitute | **Not used** |

## Phase 6 — Deployment verification

| Environment | Auth fix exercised? | Notes |
|-------------|---------------------|-------|
| Local | **Yes** | Fix verified; `/login` 200; full signed-in UI |
| Vercel Preview | Env present (`SESSION_SECRET`, `BREEZY_API_KEY`, DB) | **Not redeployed** — no push/deploy authorized |
| Vercel Production | Env present | **Not redeployed** — no push/deploy authorized |

Redeploy required to pick up the client-safe import split on Preview/Production after merge.

## Phase 7 — Tests

```bash
NODE_ENV=development node --import tsx --test \
  src/lib/auth/p261-auth-recovery.test.ts \
  src/lib/p259-candidate-operations/p259-candidate-operations.test.ts \
  src/lib/p260-live-paperwork-workspace/p260-live-paperwork-workspace.test.ts \
  src/lib/onboarding-send-packet-sync.test.ts \
  src/lib/proxy-public-paths.test.ts
```

**Result:** **43/43 passed** (includes new P261 suite, P259, P260 quota-0 fail-closed, packet-sync, proxy public paths).

Registered in `package.json` `test` script.

## Files changed

- `src/lib/onboarding-send-packet-duplicate.ts` **(new)**
- `src/lib/onboarding-send-packet-sync.ts` (re-export pure duplicate gate)
- `src/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility.ts` (import pure module)
- `src/lib/auth/p261-auth-recovery.test.ts` **(new)**
- `package.json` (register test)
- `artifacts/p261-auth-recovery-report.md`
- `artifacts/p261-auth-recovery.json`
- `artifacts/p261-write-validation.json`
- `artifacts/p261-test-candidate-snapshot.json`
- `artifacts/p261-operations-applicants.png` (and related screenshots)

## Outstanding blockers

1. **Dropbox production quota = 0** — blocks live send (verdict 4 NO-GO).
2. **Preview/Production redeploy** — local fix not yet deployed (no authorize to push).
3. **Ownership merge** — equal-priority manual recruiter restore via API is sticky-blocked; durable-file restore used for the reversible test candidate.

## Writes performed / packets

| Metric | Count |
|--------|------:|
| Dropbox packets created | **0** |
| Workflow Paperwork Sent from P260 send attempt | **0** |
| Assign Recruiter / Assign DM / Move Stage (test candidate) | **3** confirmed writes (+ restore) |
