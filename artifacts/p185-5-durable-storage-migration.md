# P185.5 Durable Storage Migration

Provider: **neon_postgres**
Adapter: **postgres**
Migration OK: **true**
Validation OK: **true**
Queue: 25 → 25
Cohort: 25 → 25
Storage confirmation: **ready_to_confirm** (env not auto-set)
P184: enabled=true mode=dry_run

## Scheduler
- Do not restore */10 in vercel.json on Hobby (once-daily limit only).
- Preferred: external/company scheduler every 10 minutes calling POST /api/cron/p185-paperwork-automation with Authorization: Bearer $CRON_SECRET.
- Alternative: upgrade to Vercel Pro for native sub-daily cron.

## Remaining canary blockers
- P185_PRODUCTION_STORAGE_CONFIRMED is not set — set only after P185.5 migration + durability validation pass.
- P184 mode is dry_run (leave until canary authorization — do not enable now).
- Canary not authorized (do not authorize in P185.5).
- Vercel Hobby cannot run */10 native cron — use external scheduler or Pro.
