# P249 — Safe Live Execution Plan

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T13:56:21.245Z
**Recommendation:** NO-GO

> Plan only — do not execute live from this artifact.

## Step order

### 1. Fix Resend configuration blockers

- Count: 6
- Risk: high
- Notes: Set RESEND_API_KEY, DIRECT_DEPOSIT_EMAIL_MODE=resend, SRS_RECRUITING_FROM_EMAIL; verify domain

### 2. Re-run P249 / P248 config check (read-only)

- Count: n/a
- Risk: low
- Command: `npx tsx scripts/p249-run-daily-ops-mission.ts`
- Notes: Confirm readyForLive=true before any --live flags

### 3. P246 reminder canary (3) after Resend ready

- Count: 3
- Risk: medium
- Command: `npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live --canary-only`
- Notes: Does NOT resend Dropbox packets; transactional email only

### 4. P246/P248 remaining Reminder 1 cohort

- Count: 177
- Risk: medium
- Command: `npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live --continue-full`
- Notes: Batch size 25 with pause; est. 20 minutes

### 5. Initial open-store paperwork canary (Dropbox testMode)

- Count: 1
- Risk: high
- Command: `export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true AUTONOMOUS_PAPERWORK_LIVE_MODE=true AUTONOMOUS_PAPERWORK_OPERATOR_GO=true; npx tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts --live --confirm-live`
- Notes: Safe capacity=19; confirm testMode intent

### 6. Advance signed → Ready for MEL (manual/authorized)

- Count: 18
- Risk: medium
- Notes: No automatic MEL writes in this mission — verify signatures then load MEL

## Throughput estimate

- Initial sends/hour (cap): 19
- Reminders/hour (theoretical): 250
- Est. minutes for reminders: 20
- Est. minutes for initial sends: 3

## Operational risks

- Dropbox testMode=true — packets may be test envelopes until production mode authorized
- Live reminder email blocked until Resend is configured
- 101 invalid emails will bounce if forced
- 103 packets missing signatureRequestId
- Never pass --live without --confirm-live
- Do not enable apply-safe-corrections until operator reviews reconciliation conflicts
