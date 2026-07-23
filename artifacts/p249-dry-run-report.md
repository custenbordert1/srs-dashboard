# P249 — Complete Dry Run Report

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T13:54:54.149Z
**Zero writes confirmed:** yes

| Write class | Count |
| --- | ---: |
| Live emails sent | 0 |
| Dropbox writes | 0 |
| MEL writes | 0 |
| Breezy writes | 0 |

## Simulations

| Simulation | Count |
| --- | ---: |
| Initial paperwork would send | 1 |
| Initial deferred/blocked | 68 |
| Reminders would send | 180 |
| Reminders skipped (cooldown/dup) | 55 |
| Duplicates detected | 6 |
| Dropbox refresh probed | 414 |
| Dropbox refresh OK | 414 |
| Idempotent skips | 52 |
| Candidate advancement planned | 18 |
| Open-store eligible would send | 1 |
| Open-store safe capacity | 19 |

## Notes

- Workbook: 38/52 Opens with Applicant=Yes; 276 Breezy Posts rows.
- Resolved 274 live published jobs.
- Matched stores with positionId=37; unique positions=32.
- All matched positions have ingested applicants — skipped live Breezy candidate scan.
- Candidates on open-store positions: 73 raw → 69 after id/email dedupe (dropped 4).
- Discovered 69 applicant↔store matches.
- Classified 69: eligible=1 blocked=68.
- Already-sent exclusions=68; signed=0.
- P246 preview completed without campaign stop
- Mail capability: mode=log canLiveDeliver=false
- applySafeCorrections=false — workflow store untouched
- No --live / --confirm-live flags used

## Warnings

- DIRECT_DEPOSIT_EMAIL_MODE is not 'resend' (currently log/outbox only); RESEND_API_KEY is not configured
- RESEND_API_KEY is missing from the runtime environment (.env.local)
- DIRECT_DEPOSIT_EMAIL_MODE must be 'resend' (currently 'log')
- SRS_RECRUITING_FROM_EMAIL is unset; resolver falls back to DIRECT_DEPOSIT_FROM (HR). Set SRS_RECRUITING_FROM_EMAIL to the approved recruiting sender before live reminder sends.
- RESEND_API_KEY present: Missing from runtime environment
- DIRECT_DEPOSIT_EMAIL_MODE=resend: Current mode: log
