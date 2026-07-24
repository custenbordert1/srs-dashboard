# P260 — Live Paperwork Send from Hiring Workspace

**Generated:** 2026-07-23  
**Scope:** Connect confirmed “Send Paperwork” in Job Command Center Operations to the existing production Dropbox Sign engine (thin adapter only).  
**API:** `POST /api/recruiting/job-command-center/send-paperwork`

## Three verdicts

| # | Gate | Verdict | Why |
|---|------|---------|-----|
| 1 | P259 signed-in operations UI | **NO-GO** | Authenticated operator verification blocked: `/login` serves a Next.js runtime error overlay (HTTP 500). Session cannot be established; no screenshots invented. |
| 2 | P260 production implementation | **GO** | Thin adapter + API + UI confirm path + unit/integration tests implemented. Fail-closed on quota 0. Reuses P253/P256/P192/P243 engine pieces — no duplicated eligibility/template/idempotency stores. |
| 3 | Actual live candidate send | **NO-GO** | Production Dropbox Sign `api_signature_requests_left` = **0**. Fail-closed abort; **0 packets created**, **0 workflow Paperwork Sent writes**. |

## Quota result

- **accountQuotaRemaining:** `0`
- **testMode:** `false` (production mode confirmed)
- **apiKeyPresent:** `true` (with `.env.local` loaded)
- **Probe detail:** `ABORTED — Production Dropbox Sign quota is 0 (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.`

Consistent with `artifacts/p253-live-send.json` (same day).

## Writes / packets

| Metric | Count |
|--------|------:|
| Dropbox packets created | **0** |
| Workflow Paperwork Sent writes | **0** |
| Live candidate sends | **0** |

## Operator flow (implemented)

1. **Preview** — Send Paperwork → confirm → preview modal  
2. **Confirm** — continue → typed phrase modal (`I reviewed this candidate and authorize one production Dropbox Sign paperwork packet.`)  
3. **Pre-send refresh** — workflow / Dropbox / distance / coverage  
4. **Send** — production eligibility + quota preflight + `executeOnboardingSend` (production-only)  
5. **Verify** — post-send Dropbox re-read; Paperwork Sent only after Dropbox success  
6. **UI** — success/failure toast + applicant reload  
7. **Audit** — activity trail events (preview, confirm, refresh, preflight, send, quota/packet/idempotency blocks, timeout reconcile, verify)

### Typed confirmation required when

- Distance 40–60 miles  
- Prior expired packet  
- Manually recovered  
- Nonstandard override  

Hard blocks (no bypass): active/viewed/signed packets, duplicates, missing identity/email/template, missing quota/credentials, distance > 60.

## Architecture

| Layer | Path |
|-------|------|
| Adapter | `src/lib/p260-live-paperwork-workspace/` |
| API | `src/app/api/recruiting/job-command-center/send-paperwork/route.ts` |
| UI | `job-command-center-panel.tsx`, confirm modal (typed phrase), paperwork preview |
| Engine reuse | `executeOnboardingSend`, `prepareOnboardingSend`, `sendTemplateSignatureRequestProductionOnly`, P256 quota probe, P243 idempotency store, P253 refresh/proximity helpers |

**Source stamp:** `Job Command Center`  
**Idempotency key:** `sha256(p260\|candidateId\|templateKey)` + P243 durable store + in-flight double-click guard  
**One at a time:** API rejects multi-candidate bodies; no bulk/auto/scheduled/reminder/resend

## Tests

```bash
node --import tsx --test src/lib/p260-live-paperwork-workspace/*.test.ts
```

**Result:** 16/16 P260 + 12/12 P259 = **28/28 passed**

Coverage includes: quota 0, missing credentials, active/viewed/signed packets, missing identity/email/template, distance 40–60 typed confirm, double-click in-flight, durable idempotency, timeout reconcile (no Paperwork Sent), cancel (no write), mocked success path.

Registered in `package.json` `test` script.

## P259 signed-in verification

- Attempted browser navigation to `http://localhost:3000/login`
- Observed Next.js error overlay / HTTP 500 — cannot sign in
- Code review of P259 Operations wiring: intact (confirm-gated assign/stage; Send Paperwork now continues into P260). No critical P259 wiring break found that would stop P260 implementation.

## Blockers

1. **Login / session** — `/login` runtime failure blocks authenticated P259 UI verification  
2. **Dropbox production quota = 0** — blocks any live candidate packet until vendor quota is restored  

## Files changed / added

- `src/lib/p260-live-paperwork-workspace/*` (new)
- `src/app/api/recruiting/job-command-center/send-paperwork/route.ts` (new)
- `src/components/recruiting/job-command-center-panel.tsx`
- `src/components/recruiting/candidate-operations-confirm-modal.tsx`
- `src/components/recruiting/hiring-workspace-paperwork-preview.tsx`
- `src/lib/p259-candidate-operations/{actions,future-hooks,paperwork-panel,types,p259-*.test}.ts`
- `src/lib/p258-hiring-workspace/types.ts`
- `package.json`
- `artifacts/p260-live-paperwork-workspace-report.md`
- `artifacts/p260-live-paperwork-workspace.json`
