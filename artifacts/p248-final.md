# P248 — Resend Live Reminder Campaign Final Report

**Generated:** 2026-07-21T21:04:39.471Z
**Ready for live:** no
**Stopped before live:** yes
**Stop reason:** Resend API key unavailable — live canary and full campaign were not started

## Configuration

| Item | Value |
|---|---|
| Resend configuration | blocked |
| Sender domain verification | not attempted (no API key) |
| From address (intended) | recruiting@strategicretailsolutions.com |
| Reply-to address (intended) | recruiting@strategicretailsolutions.com |
| Current env From fallback | humanresource@srsmerchandising.com (HR — must override before live) |

## Refreshed preview vs prior P246

| Metric | Prior P246 | P248 refresh |
|---|---|---|
| Evaluated | 517 | 517 |
| Dropbox verified | 414 | 414 |
| Eligible Reminder 1 | 144 | 144 |
| Signed/completed | 66 | 66 |
| Cadence not met | 101 | 101 |
| Invalid emails | 101 | 101 |
| Missing signature requests | 103 | 103 |
| Frozen Reminder 1 cohort | — | 144 |
| Signed since prior (aggregate delta) | — | 0 (eligible count unchanged) |

## Cohort

| # | Metric | Count |
|---|---|---|
| 5 | Candidates evaluated | 517 |
| 6 | Dropbox verified | 414 |
| 7 | Eligible Reminder 1 | 144 |
| — | Frozen cohort | 144 |
| 8 | Canary attempted | 0 |
| 9 | Canary confirmed | 0 |
| 10 | Full-campaign attempted | 0 |
| 11 | Full-campaign confirmed | 0 |
| 12 | Signed-before-send skips | 0 |
| 13 | Cadence / recently reminded | 101 |
| 14 | Invalid email exclusions | 101 |
| 15 | Dropbox verification failures | 0 |
| 16 | Resend delivery failures | 0 |
| 17 | Duplicate reminders prevented | 0 |
| 18 | Reminder-history count | 0 |
| 19 | Dropbox packets resent | no |
| 20 | Live writes occurred | no |

Disposition sum 517 / evaluated 517 — reconciles.

## Blockers

- RESEND_API_KEY is missing from the runtime environment (.env.local)
- DIRECT_DEPOSIT_EMAIL_MODE must be 'resend' (currently 'log')
- SRS_RECRUITING_FROM_EMAIL is unset; resolver falls back to DIRECT_DEPOSIT_FROM (HR). Set SRS_RECRUITING_FROM_EMAIL to the approved recruiting sender before live reminder sends.

## Exact next step

1. Add `RESEND_API_KEY` and `DIRECT_DEPOSIT_EMAIL_MODE=resend` to `.env.local` (do not commit).
2. Set `SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com` and matching reply-to.
3. Verify the From domain in Resend.
4. Re-run: `npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live`
5. After canary success, continue with `--continue-full`.

## Files modified

- `src/lib/p248-resend-live-reminder-campaign/*`
- `scripts/p248-run-resend-live-reminder-campaign.ts`
- `src/lib/p246-outstanding-paperwork-reminders/send.ts`

## Artifacts created

- `artifacts/p248-resend-configuration-check.md`
- `artifacts/p248-live-preview.md`
- `artifacts/p248-live-preview.json`
- `artifacts/p248-frozen-reminder-cohort.json`
- `artifacts/p248-canary-results.json`
- `artifacts/p248-reminders-confirmed.json`
- `artifacts/p248-reminder-skips.json`
- `artifacts/p248-reminder-failures.json`
- `artifacts/p248-invalid-email-cleanup.json`
- `artifacts/p248-missing-signature-request-cleanup.json`
- `artifacts/p248-final.md`
- `artifacts/p248-final.json`

