# P185 Paperwork Backlog Rollout — Dry Run

Generated: 2026-07-10T16:35:46.087Z
Live sending: **DISABLED**

## Backlog
- Total evaluated: **677**
- Eligible for paperwork: **0**
- Already sent: **132**
- Active envelopes: **132**
- Rejected: **677**
- Queue depth (durable): **0**
- Est. time to clear eligible: **0 min** (~0 cycles @ 10/cycle every 10 min)

## Rejection reasons
- Current status: Applied: 529
- Job not found.: 528
- Position is not accepting candidates.: 528
- Paperwork already pending or in flight.: 132
- Current status: Paperwork Sent: 115
- Packet already sent — awaiting signature.: 115
- Current status: Signed: 17
- Paperwork already completed.: 17
- Paperwork already signed.: 17
- Current status: Needs Review: 10
- Candidate appears archived/withdrawn.: 8
- Current status: Not Qualified: 6
- Candidate already hired.: 3

## Live gates
- durableStorageHealthy: OK
- dropboxSignHealthy: OK
- breezySourceHealthy: OK
- schedulerAuthenticationConfigured: BLOCKED
- leaseAvailable: OK
- recentDryRunSuccessful: OK
- killSwitchInactive: OK
- circuitBreakerClosed: OK

## Blockers
- Scheduler authentication not configured (set CRON_SECRET or P185_CRON_SECRET).

## Controlled rollout config (applied; live still off)
```json
{
  "schedulerCadence": "*/10 * * * *",
  "maxSendsPerCycle": 10,
  "maxPerMinute": 4,
  "maxPerHour": 40,
  "maxPerDay": 200,
  "concurrentSends": 2,
  "maxFailuresPerCycle": 3,
  "p184Enabled": false,
  "p184Mode": "dry_run",
  "p185ProductionAutomationEnabled": false
}
```

## Env / config required before live
1. Set CRON_SECRET (or P185_CRON_SECRET) in the deployment environment
1. Set P185_PRODUCTION_AUTOMATION_ENABLED=1
1. On serverless: set P185_DURABLE_DATA_DIR to a durable volume (not /tmp)
1. Enable P184 via update_config: enabled=true (keep mode=dry_run until final step)
1. Confirm another dry-run after enablement
1. Set P184 mode=live only after all gates green
1. Do not raise maxSendsPerCycle above 10 for initial rollout
