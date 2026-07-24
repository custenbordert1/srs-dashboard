# P250 — Production Safety Review

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T14:15:12.206Z
**Mode:** read_only_code_and_ops_review

## Controls

| Control | Status | Evidence | Residual risk |
| --- | --- | --- | --- |
| Initial paperwork already-sent / signed exclusion | present | P242/P243 classify sets alreadySentExclusion and signedExclusion; dry-run excluded 68 already_sent | — |
| Reminder idempotency keys | present | P246 buildP246IdempotencyKey + hasIdempotencyKey / usedIdempotencyKeys in reminder store before send | Reminder store file was absent in P249 — first live run creates it; ensure durable path is writable |
| Dropbox live status refresh before reminder send | present | send.ts calls probeDropboxLiveStatus(..., { forceRefresh: true }) and skips signed/complete/ineligible | — |
| Reminder cadence / cooldown | present | isCadenceSatisfied + max 4 reminders; P249 cooldown_not_met=52 | — |
| Signed / completed exclusion | present | Eligibility + pre-send probe skip signed_before_send; P249 signed_or_completed=78 | — |
| Transient retry + campaign stop on provider failures | present | One retry after 750ms for transient errors; stopCampaign on auth/domain/429/persistence failures | Operator must not re-run --continue-full without reviewing stopReason |
| Batch rate limiting | present | P246_BATCH_SIZE=25, P246_BATCH_PAUSE_MS=1500 | Resend account limits still apply; campaign stops on 429 |
| Send / skip audit records | present | P246 records sent/skips/failures with idempotencyKey, messageId, failureClass; P248 writes campaign artifacts | — |
| Live flags + dry-run default | present | Scripts refuse --live without --confirm-live; P243 requires dryRun=false + confirmLive + execute; P250/P249 refuse live flags | — |
| Resend live delivery gate | missing | readyForLive=false — RESEND / mode / From / domain blockers remain | Any accidental --live will stop before delivery while mailer is log/outbox |
| Dropbox testMode guard for initial packets | operator_dependent | DROPBOX_SIGN_TEST_MODE / config testMode=true; P243 refuses live when testMode is not true | Production quota=0 — production-mode packet sends blocked; testMode packets are test envelopes |
| No automatic MEL writes in reminder/initial paths | present | P246/P248 do not write MEL; Ready-for-MEL advancement is manual/authorized after signature verify | — |

## Live write guards

- P250 script rejects --live / --confirm-live
- P249 script rejects --live / --confirm-live
- P248 requires --live AND --confirm-live; defaults to config+freeze only
- P243 execute requires dryRun=false + confirmLive=true + execute=true
- P246 send path skips when mail.canLiveDeliver is false when requireLiveDelivery=true
- P250 performs zero emails, Dropbox writes, Breezy writes, MEL writes, or DB mutations

## Remaining production risks

- Live email blocked until Resend configuration FAILs are remediated
- Dropbox Sign production quota=0 — initial packet production sends blocked; use intentional testMode only
- Dropbox testMode=true — initial packets are test envelopes until production mode is authorized and quota restored
- 101 invalid emails excluded from reminders — clean in Breezy before forcing
- 103 outstanding packets missing signatureRequestId — reconcile before chasing
- Do not enable P246 --apply-safe-corrections until reconciliation conflicts are operator-reviewed
- Reminder store was not present at P249 — first successful live reminder persists idempotency history; protect .data/
- Never pass --live without --confirm-live
