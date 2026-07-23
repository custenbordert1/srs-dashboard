# P250 — Blockers and Remediation

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T14:15:12.205Z
**Readiness overall:** FAIL
**Mode:** read-only (no sends)

| Status | Count |
| --- | ---: |
| PASS | 8 |
| FAIL | 4 |
| WARN | 7 |

## Modes

- Email mode: `log`
- Dropbox testMode: `true`
- Resend ready for live: no
- Pilot live env: no

## Blockers (FAIL) — exact remediation

### RESEND_API_KEY present (`resend_api_key`)

- **Observed:** Missing from runtime environment
- **Automatic fix:** no
- **Remediation steps:**
  1. Open https://resend.com/api-keys and create (or copy) an API key for the SRS Resend account.
  2. Add to `.env.local` (do not commit): `RESEND_API_KEY=<paste key>`
  3. Restart any running Node/tsx process so it picks up the new env.
  4. Re-run: `npx tsx scripts/p250-run-go-live-preparation.ts` and confirm this check PASS (length shown only; value never printed).
- **Verify:** `npx tsx scripts/p250-run-go-live-preparation.ts`

### DIRECT_DEPOSIT_EMAIL_MODE=resend (`email_mode`)

- **Observed:** Current mode: log
- **Automatic fix:** no
- **Remediation steps:**
  1. In `.env.local` set: `DIRECT_DEPOSIT_EMAIL_MODE=resend`
  2. Do not use `log` or `outbox` for live reminder delivery.
  3. Re-run P250 (or P248 config check) and confirm mode=`resend` and canLiveDeliver=true.
- **Verify:** `npx tsx scripts/p250-run-go-live-preparation.ts`

### Recruiting From address (`sender_from`)

- **Observed:** Resolved From: humanresource@srsmerchandising.com
- **Automatic fix:** no
- **Remediation steps:**
  1. In `.env.local` set: `SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com`
  2. Optionally set: `SRS_RECRUITING_REPLY_TO_EMAIL=recruiting@strategicretailsolutions.com`
  3. Do not leave From falling back to DIRECT_DEPOSIT_FROM (HR) for recruiting reminders.
  4. Confirm the address is an approved mailbox on a Resend-verified domain.
- **Verify:** `npx tsx scripts/p250-run-go-live-preparation.ts`

### Sender domain verification (`sender_domain`)

- **Observed:** Skipped — RESEND_API_KEY unavailable
- **Automatic fix:** no
- **Remediation steps:**
  1. Ensure RESEND_API_KEY is set first (domain probe requires it).
  2. In Resend dashboard → Domains: add/verify the From domain (e.g. strategicretailsolutions.com).
  3. Complete SPF/DKIM/DMARC per Resend DNS instructions for that domain.
  4. Wait until Resend shows domain status `verified`.
  5. Re-run P250; sender domain check must PASS before live email.
- **Verify:** `npx tsx scripts/p250-run-go-live-preparation.ts`

## Warnings (WARN)

### SPF (public DNS) (`spf_dkim`)

- **Observed:** SPF TXT found for srsmerchandising.com; DKIM not verified without RESEND_API_KEY
- **Remediation steps:**
  1. Configure RESEND_API_KEY so Resend domain status (SPF/DKIM) can be probed.
  2. In Resend → Domains, confirm SPF and DKIM records are valid for the From domain.
  3. If public DNS SPF exists but Resend is unverified, finish Resend verification before live send.

### Dropbox Sign connectivity (read-only) (`dropbox_connectivity`)

- **Observed:** Vendor blocked: production quota=0 (software ready=false) (apiStatus=ok, config=misconfigured)
- **Remediation steps:**
  1. Production Dropbox Sign quota is 0 (vendor_blocked) — status probes still work.
  2. For reminder emails only: no Dropbox write required; proceed after Resend is ready.
  3. For initial paperwork packet sends: either restore production quota with Dropbox Sign support, or intentionally keep `DROPBOX_SIGN_TEST_MODE=true` and document that packets are test envelopes.
  4. Do not flip testMode to false while production quota remains 0.

### Live pilot feature flags (`feature_flags_pilot`)

- **Observed:** Not set for live paperwork: AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED, AUTONOMOUS_PAPERWORK_LIVE_MODE, AUTONOMOUS_PAPERWORK_OPERATOR_GO
- **Remediation steps:**
  1. Only for live initial paperwork (P243), export before `--live --confirm-live`:
  2.   `export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true`
  3.   `export AUTONOMOUS_PAPERWORK_LIVE_MODE=true`
  4.   `export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true`
  5. Reminder campaign (P248) does not require these pilot flags.

### P151_ENABLED (`flag_p151_enabled`)

- **Observed:** unset/false (informational)
- **Remediation steps:**
  1. Review checklist detail and remediate using the owning runbook for this check.

### P184_ENABLED (`flag_p184_enabled`)

- **Observed:** unset/false (informational)
- **Remediation steps:**
  1. Review checklist detail and remediate using the owning runbook for this check.

### P185_ENABLED (`flag_p185_enabled`)

- **Observed:** unset/false (informational)
- **Remediation steps:**
  1. Review checklist detail and remediate using the owning runbook for this check.

### P186_READY_FOR_MEL_REVIEW_ACTIONS (`flag_p186_ready_for_mel_review_actions`)

- **Observed:** unset/false (informational)
- **Remediation steps:**
  1. Review checklist detail and remediate using the owning runbook for this check.

## Env presence (secrets never printed)

| Variable | Present | Notes |
| --- | --- | --- |
| RESEND_API_KEY | no | Required for live email; value never printed |
| DIRECT_DEPOSIT_EMAIL_MODE | yes | Current=log; must be resend for live |
| SRS_RECRUITING_FROM_EMAIL | no | Approved fallback when set: recruiting@strategicretailsolutions.com |
| DROPBOX_SIGN_API_KEY | yes | Present for status probes |
| DROPBOX_SIGN_TEST_MODE | yes | Current=true |
| BREEZY_API_KEY | yes | Required for candidate/job reads |
| DATABASE_URL / P185_DATABASE_URL | yes | Neon/Postgres durable store |
| SESSION_SECRET | yes | App session signing |
| AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED | no | Required only for live initial paperwork pilot |
| AUTONOMOUS_PAPERWORK_LIVE_MODE | no | Required only for live initial paperwork pilot |
| AUTONOMOUS_PAPERWORK_OPERATOR_GO | no | Required only for live initial paperwork pilot |

## Source

- Readiness refreshed: yes
- P249 artifacts reused: p249-operations-dashboard.json, p249-outstanding-paperwork-analysis.json, p249-dry-run-report.json, p249-go-nogo.json, p249-live-execution-plan.json
