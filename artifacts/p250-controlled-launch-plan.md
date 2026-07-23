# P250 — Controlled Launch Plan

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T14:15:12.206Z
**Recommendation:** NO-GO

> Plan only — P250 does **not** execute live. Explicit operator approval required before any `--live` command.

## Expected volumes (from P249 / current dry-run)

| Stage | Count |
| --- | ---: |
| Test / canary email | 1 |
| Initial paperwork | 1 |
| Reminder 1 batch | 180 |
| Ready for MEL (advance) | 18 |
| Open-store safe capacity | 19 |

## Prerequisite blockers

- RESEND_API_KEY is missing from the runtime environment (.env.local)
- DIRECT_DEPOSIT_EMAIL_MODE must be 'resend' (currently 'log')
- SRS_RECRUITING_FROM_EMAIL is unset; resolver falls back to DIRECT_DEPOSIT_FROM (HR). Set SRS_RECRUITING_FROM_EMAIL to the approved recruiting sender before live reminder sends.
- Sender domain verification: Skipped — RESEND_API_KEY unavailable

## Sequence

### 0. prerequisites — Resolve all Resend / env blockers; re-run P250 until decision=GO

- Count: 4
- Risk: high
- Command: `npx tsx scripts/p250-run-go-live-preparation.ts`
- Verify:
  - readinessOverall PASS or WARN with failCount=0
  - modes.resendReady=true
  - go-nogo decision is GO
- Rollback:
  - Do not proceed to any --live command until GO
- Stop if:
  - Any FAIL blocker remains

### 1. test_email — Send single Resend test/canary email (P248 canary-only first recipient path)

- Count: 1
- Risk: medium
- Command: `npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live --canary-only`
- Verify:
  - Resend dashboard shows delivered/accepted message for canary recipient(s)
  - Artifact / console: canaryConfirmed ≥ 1, dropboxPacketsResent=false
  - No Dropbox signature requests created
- Rollback:
  - Do not run --continue-full
  - If auth/domain failure: revert DIRECT_DEPOSIT_EMAIL_MODE to log until fixed
  - Leave reminder store as-is (idempotency keys protect re-send)
- Stop if:
  - readyForLive=false
  - stopReason set (auth, domain, rate limit)
  - canaryConfirmed=0 with failures

### 2. verify_test_email — Operator verifies inbox content, From, Reply-To, and links

- Count: 1
- Risk: low
- Verify:
  - From is recruiting sender (approved: recruiting@strategicretailsolutions.com)
  - No Dropbox packet re-created
  - Candidate still outstanding in Dropbox after canary
- Rollback:
  - Abort launch; keep mode=log until copy/domain corrected
- Stop if:
  - Wrong From domain
  - Broken signing link
  - Unexpected Dropbox write

### 3. initial_paperwork — Send initial open-store paperwork (eligible count from P249)

- Count: 1
- Risk: high
- Command: `export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true AUTONOMOUS_PAPERWORK_LIVE_MODE=true AUTONOMOUS_PAPERWORK_OPERATOR_GO=true; npx tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts --live --confirm-live`
- Verify:
  - Eligible would-send count remains 1 after fresh preview
  - Dropbox Sign shows new signature request for the candidate
  - Safe capacity respected (P249 safeCapacity=19)
  - Confirm intentional DROPBOX_SIGN_TEST_MODE before execute
- Rollback:
  - Stop further P243 live runs
  - Cancel/void the test signature request in Dropbox Sign if packet was unwanted
  - Do not flip testMode to production while quota=0
- Stop if:
  - testMode unexpectedly false with production quota=0
  - Capacity gate trip
  - Breezy/Dropbox API errors

### 4. verify_dropbox — Verify Dropbox packet created and status probe readable

- Count: 1
- Risk: medium
- Verify:
  - Signature request id stored on workflow / packet
  - Signer email matches candidate
  - Status probe returns outstanding (not signed yet)
- Rollback:
  - Do not start Reminder 1 batch until packet verified
  - Reconcile missing signatureRequestId before any reminder chase
- Stop if:
  - Packet missing
  - Email mismatch
  - Vendor quota error on create

### 5. reminder1_batch — Send Reminder 1 cohort (after canary success)

- Count: 180
- Risk: medium
- Command: `npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live --continue-full`
- Verify:
  - Target Reminder 1 eligible ≈ 180 (P249 dry-run)
  - Batch size 25 with 1500ms pause
  - dropboxPacketsResent=false throughout
  - Idempotent skips for already-reminded keys
- Rollback:
  - Interrupt process (Ctrl+C) — in-flight batch finishes current send only
  - Do not re-run --continue-full until stopReason reviewed
  - Idempotency keys prevent duplicate reminder numbers for same packet
- Stop if:
  - stopCampaign / stopReason (auth, domain, 429, persistence)
  - Unexpected Dropbox writes
  - Spike in unexplained provider errors

### 6. monitor — Monitor delivery, bounces, and Dropbox outstanding counts

- Count: n/a
- Risk: low
- Command: `npx tsx scripts/p249-run-daily-ops-mission.ts`
- Verify:
  - Resend bounce/complaint rate acceptable
  - Outstanding signatures trend down or stable
  - No unintended Breezy/MEL writes
- Rollback:
  - Freeze further campaigns (do not pass --live)
  - Set DIRECT_DEPOSIT_EMAIL_MODE=log if emergency halt needed
- Stop if:
  - Elevated bounce rate
  - Resend account lock
  - Dropbox API outage

### 7. refresh — Refresh Dropbox statuses and eligibility (read-only / preview)

- Count: n/a
- Risk: low
- Command: `npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts`
- Verify:
  - Signed-before-send exclusions increase as candidates complete
  - Cooldown and idempotent skips remain correct
- Rollback:
  - Do not apply-safe-corrections without operator review
- Stop if:
  - Mass status probe failures

### 8. advance_signed — Advance verified signed candidates toward Ready for MEL (manual/authorized)

- Count: 18
- Risk: medium
- Verify:
  - ~18 candidates in Ready for MEL / verify-signed queues (P249)
  - Signature complete in Dropbox before MEL load
  - No automatic MEL API writes from this launch plan
- Rollback:
  - Do not load MEL for incomplete signatures
  - Revert workflow status only via authorized operator tooling
- Stop if:
  - Unsigned packet marked Ready for MEL
  - MEL write attempted without approval

## Monitoring

- Resend dashboard: delivered / bounced / complained
- Dropbox Sign: new requests, completions, quota
- P249 ops dashboard: reminder buckets, Ready for MEL, blocked manual counts
- Reminder store idempotency growth under .data/
- Application logs for stopCampaign reasons

## Gates

- Explicit approval required: yes
- Live execution in P250: no
