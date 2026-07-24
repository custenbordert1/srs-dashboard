# P251 — Mail System Remediation Audit

**Generated:** 2026-07-23T14:43:44.172Z
**Deployment tier:** development
**Live email ready:** no

## Capability

| Check | Value |
| --- | --- |
| Mode | `log` |
| RESEND_API_KEY | MISSING |
| SRS_RECRUITING_FROM_EMAIL | UNSET → `humanresource@srsmerchandising.com` |
| SRS_RECRUITING_REPLY_TO_EMAIL | UNSET → `humanresource@srsmerchandising.com` |
| canLiveDeliver | no |

## FAIL / WARN — exact remediation

### [FAIL] resend_api_key

- **Why:** Missing from runtime — Resend cannot authenticate; live email blocked
- **File:** `.env.local`
- **Variable:** `RESEND_API_KEY`
- **Expected format:** `RESEND_API_KEY=<api key from https://resend.com/api-keys> (never commit)`
- **Fix type:** config_only
- **Steps:**
  1. Open https://resend.com/api-keys and create/copy a key for the SRS Resend account
  1. Add to `.env.local` (do not commit): `RESEND_API_KEY=<paste key>`
  1. Leave placeholder empty in `.env.local.example` / `.env.example` documentation only
  1. Restart Node/tsx / Next.js so the process loads the new env

### [FAIL] email_mode

- **Why:** Current mode is 'log' — sendTransactionalEmail only logs to outbox
- **File:** `.env.local`
- **Variable:** `DIRECT_DEPOSIT_EMAIL_MODE`
- **Expected format:** `DIRECT_DEPOSIT_EMAIL_MODE=resend`
- **Fix type:** config_only
- **Steps:**
  1. In `.env.local` set: `DIRECT_DEPOSIT_EMAIL_MODE=resend`
  1. Do not use `log` or `outbox` for live reminder delivery

### [FAIL] sender_from

- **Why:** Resolved From falls back to HR (humanresource@srsmerchandising.com) — unsafe for recruiting reminders
- **File:** `.env.local`
- **Variable:** `SRS_RECRUITING_FROM_EMAIL`
- **Expected format:** `SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com`
- **Fix type:** config_only
- **Steps:**
  1. In `.env.local` set: `SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com`
  1. Confirm the mailbox is on a Resend-verified domain

### [WARN] sender_reply_to

- **Why:** Reply-To not explicitly set for recruiting reminders
- **File:** `.env.local`
- **Variable:** `SRS_RECRUITING_REPLY_TO_EMAIL`
- **Expected format:** `SRS_RECRUITING_REPLY_TO_EMAIL=recruiting@strategicretailsolutions.com`
- **Fix type:** config_only
- **Steps:**
  1. In `.env.local` set: `SRS_RECRUITING_REPLY_TO_EMAIL=recruiting@strategicretailsolutions.com`

### [FAIL] sender_domain

- **Why:** Sender domain verification skipped — RESEND_API_KEY unavailable
- **File:** `Resend dashboard + .env.local`
- **Variable:** `RESEND_API_KEY`
- **Expected format:** `Domain must show status=verified in Resend for the From domain`
- **Fix type:** vendor
- **Steps:**
  1. Set RESEND_API_KEY first (required to probe domains)
  1. In Resend → Domains: verify strategicretailsolutions.com (SPF/DKIM/DMARC)
  1. Re-run `npx tsx scripts/p251-run-production-readiness-remediation.ts`

## Operator config block (paste into `.env.local` — no fake keys)

```bash
RESEND_API_KEY=<paste Resend API key from https://resend.com/api-keys>
DIRECT_DEPOSIT_EMAIL_MODE=resend
SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com
SRS_RECRUITING_REPLY_TO_EMAIL=recruiting@strategicretailsolutions.com
```
