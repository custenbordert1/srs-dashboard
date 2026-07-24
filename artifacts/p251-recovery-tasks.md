# P251 — Operational Recovery Tasks

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T14:43:44.171Z
**Mode:** read_only

| Priority | Action | Title | Count | Blocked by mail? |
| --- | --- | --- | ---: | --- |
| P0 | retry | Configure Resend before any live resend / reminder batch | 180 | yes |
| P0 | resend | Send Reminder 1 cohort (after mail GO) | 180 | yes |
| P1 | retry | Retry eligible initial paperwork send | 1 | no |
| P1 | reconcile | Reconcile packets missing signatureRequestId | 103 | no |
| P1 | manual_review | Clean invalid emails in Breezy / workflow | 101 | no |
| P2 | reconcile | Apply safe status corrections when authorized | 88 | no |
| P2 | duplicate_cleanup | Review duplicate candidate detections from dry-run | 6 | no |
| P1 | manual_review | Advance Ready-for-MEL candidates (no MEL writes from this mission) | 18 | no |

## Details

### config-resend-before-resend-batch

180 Reminder 1 and initial sends are queued but live delivery is blocked until RESEND_API_KEY + DIRECT_DEPOSIT_EMAIL_MODE=resend + SRS_RECRUITING_FROM_EMAIL.

### resend-reminder-1-batch

Zero-write dry-run already sized this batch. Execute only after P251/P250 GO with --live --confirm-live.

`npx tsx scripts/p248-run-resend-live-reminder-campaign.ts  # after mail config + explicit approval`

### retry-initial-paperwork

1 open-store eligible packet. Production Dropbox quota may still be 0 — keep DROPBOX_SIGN_TEST_MODE intentional until quota restored.

`npx tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts  # dry-run first; live only after flags + approval`

### reconcile-missing-signature-request

Cannot remind without Dropbox signature request id — reconcile store or resend initial packet.

`npx tsx scripts/p244-run-open-store-reconciliation.ts`

### manual-review-invalid-emails

Excluded from reminders until addresses are fixed in Breezy.

### reconcile-status-conflicts

Do not enable P246 --apply-safe-corrections until operator reviews reconciliation conflicts.

`npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts  # preview only until authorized`

### duplicate-cleanup

Dry-run detected duplicates; confirm idempotency keys / store hygiene before live reminder batch.

### manual-review-ready-for-mel

Candidates classified ready for MEL verification — recruiter review only; P251 does not write MEL.

## Sources
- p249-operations-dashboard.json
- p249-outstanding-paperwork-analysis.json
- p249-dry-run-report.json
- p249-go-nogo.json
- p249-live-execution-plan.json
- p250-blockers-and-remediation.json
- p250-go-nogo.json
