# P185 Production Paperwork Automation Runner — Validation

Generated: 2026-07-10T16:30:00.000Z

## Storage
- Adapter: `local_filesystem` (dev) / `durable_volume` when `P185_DURABLE_DATA_DIR` or `/mnt` is set
- Durability: Live fails closed for `in_memory` and serverless `/tmp` (`ephemeral_tmp`)

## Scheduler
- Vercel Cron: `*/10 * * * *` → `/api/cron/p185-paperwork-automation` (`vercel.json`)
- Max sends per cycle (default): 10 (P184 daily/hourly/minute limits retained)
- Company-hosted example:
  `*/10 * * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/p185-paperwork-automation`
- CLI: `npx tsx scripts/p185-production-paperwork-automation-runner.ts --dry-run`

## Authentication
- Requires `CRON_SECRET` or `P185_CRON_SECRET`
- Accepts `Authorization: Bearer …` or `x-cron-secret`
- Rejects query-string secrets
- Never trusts request `mode` / `enabled`

## Lease concurrency
- PASS — CAS lease; overlap skipped (healthy non-error); expired takeover; release after cycle

## Candidate source mapping
See JSON artifact — live candidates from ingestion + Breezy published jobs + onboarding; missing data never proves eligibility (P184 gates).

## Simulations
- Dry-run cycle: PASS (17/17 tests)
- Restart recovery: PASS
- Reconciliation without resend: PASS
- Circuit breaker / kill switch / pause: PASS
- Duplicate-send protection: PASS (P184 idempotency)
- Timeout budget: PASS

## Production blockers
- Scheduler secret not configured in all environments
- `P185_PRODUCTION_AUTOMATION_ENABLED` not set (intentional)
- P184 remains `enabled: false`, `mode: dry_run` by default
- Durable volume required on serverless for live
- Dropbox Sign + recent dry-run required for live

## Live enablement readiness
**NOT READY** — left in dry-run / disabled mode. Do not enable production live sending automatically.

## Safe activation steps
1. Deploy with `CRON_SECRET` set; confirm cron hits `/api/cron/p185-paperwork-automation`
2. Configure durable storage (`P185_DURABLE_DATA_DIR` or mounted volume — not `/tmp`)
3. Confirm Dropbox Sign credentials and templates
4. Run scheduled/CLI dry-run until `lastDryRunSuccessAt` is fresh
5. Enable P184 via executive panel (`enabled=true`, still `mode=dry_run`) and verify health
6. Set `P185_PRODUCTION_AUTOMATION_ENABLED=1`
7. Set P184 `mode=live` only after dry-run + health green
8. Keep kill switch clear; monitor circuit breaker and unverified envelopes
9. Start with `maxSendsPerCycle=10` and watch confirmed vs eligible
