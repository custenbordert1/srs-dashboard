# P248 — Resend Configuration Check

**Generated:** 2026-07-21T21:00:30.451Z
**Ready for live:** no

## Integration

- Transport: `sendTransactionalEmail()`
- Integration present in codebase: yes
- Live delivery mode env: `DIRECT_DEPOSIT_EMAIL_MODE` (must be `resend`)
- API key env: `RESEND_API_KEY` (present: false, length: 0)

## Sender identity

- From: `humanresource@srsmerchandising.com`
- Reply-to: `humanresource@srsmerchandising.com`
- From domain: `srsmerchandising.com`
- Domain verification attempted: no
- Domain status: —
- Domain verified: —
- Detail: Skipped — RESEND_API_KEY unavailable

## Secrets safety

- Key not logged: yes
- Key not written to artifacts: yes
- Key not committed to source control examples: yes

## Blockers

- RESEND_API_KEY is missing from the runtime environment (.env.local)
- DIRECT_DEPOSIT_EMAIL_MODE must be 'resend' (currently 'log')
- SRS_RECRUITING_FROM_EMAIL is unset; resolver falls back to DIRECT_DEPOSIT_FROM (HR). Set SRS_RECRUITING_FROM_EMAIL to the approved recruiting sender before live reminder sends.

## Exact configuration required

Add to `.env.local` (do not commit):

```bash
RESEND_API_KEY=<paste Resend API key from https://resend.com/api-keys>
DIRECT_DEPOSIT_EMAIL_MODE=resend
SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com
SRS_RECRUITING_REPLY_TO_EMAIL=recruiting@strategicretailsolutions.com
```

Then verify the From domain in the Resend dashboard, re-run the P248 script, complete the 3-candidate canary, and only then continue the full cohort.
