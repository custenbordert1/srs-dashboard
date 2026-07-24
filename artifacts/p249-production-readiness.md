# P249 — Production Readiness Verification

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T13:56:21.244Z
**Overall:** FAIL
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

## Checklist

| Status | Category | Check | Detail |
| --- | --- | --- | --- |
| FAIL | resend | RESEND_API_KEY present | Missing from runtime environment |
| FAIL | resend | DIRECT_DEPOSIT_EMAIL_MODE=resend | Current mode: log |
| FAIL | resend | Recruiting From address | Resolved From: humanresource@srsmerchandising.com |
| FAIL | resend | Sender domain verification | Skipped — RESEND_API_KEY unavailable |
| WARN | resend | SPF (public DNS) | SPF TXT found for srsmerchandising.com; DKIM not verified without RESEND_API_KEY |
| PASS | resend | RESEND_API_KEY not committed | Key not found in tracked env example files |
| PASS | env | DROPBOX_SIGN_API_KEY | Present: DROPBOX_SIGN_API_KEY |
| PASS | env | BREEZY_API_KEY | Present: BREEZY_API_KEY |
| PASS | env | Database URL (Neon/Postgres) | Present: DATABASE_URL |
| PASS | env | SESSION_SECRET | Present: SESSION_SECRET |
| WARN | dropbox | Dropbox Sign connectivity (read-only) | Vendor blocked: production quota=0 (software ready=false) (apiStatus=ok, config=misconfigured) |
| PASS | dropbox | Dropbox testMode | testMode=true (explicit env DROPBOX_SIGN_TEST_MODE=true) |
| PASS | breezy | Breezy connectivity (read-only) | Company=SRS Merchandising; probes ok=4/4 |
| PASS | database | Database / Neon connectivity | Postgres durable adapter OK (neon_postgres). Database connectivity OK. |
| WARN | flags | Live pilot feature flags | Not set for live paperwork: AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED, AUTONOMOUS_PAPERWORK_LIVE_MODE, AUTONOMOUS_PAPERWORK_OPERATOR_GO |
| WARN | flags | P151_ENABLED | unset/false (informational) |
| WARN | flags | P184_ENABLED | unset/false (informational) |
| WARN | flags | P185_ENABLED | unset/false (informational) |
| WARN | flags | P186_READY_FOR_MEL_REVIEW_ACTIONS | unset/false (informational) |

## Blockers

- RESEND_API_KEY is missing from the runtime environment (.env.local)
- DIRECT_DEPOSIT_EMAIL_MODE must be 'resend' (currently 'log')
- SRS_RECRUITING_FROM_EMAIL is unset; resolver falls back to DIRECT_DEPOSIT_FROM (HR). Set SRS_RECRUITING_FROM_EMAIL to the approved recruiting sender before live reminder sends.
- Sender domain verification: Skipped — RESEND_API_KEY unavailable
