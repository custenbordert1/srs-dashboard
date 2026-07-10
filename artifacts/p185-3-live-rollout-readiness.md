# P185.3 — Controlled Live Rollout Readiness

Generated: 2026-07-10T17:28:02.353Z
Rollout ID: p1853-20260710-b419512d
Phase: **awaiting_configuration**
Live ready: **false**
Canary may execute: **false**

## Frozen cohort
- Count: 25
- Still eligible: 25
- Newly blocked: 0

## Gates
- cronSecretConfigured: BLOCKED
- productionAutomationEnabled: BLOCKED
- durableStorageHealthy: OK
- durableStorageNotTmp: OK
- dropboxSignConfigured: OK
- templateConfigured: OK
- p184EnabledForLive: OK
- p184ModeLive: BLOCKED
- killSwitchInactive: OK
- circuitBreakerClosed: OK
- leaseAvailable: OK
- canaryAuthorized: BLOCKED
- productionStorageConfirmed: BLOCKED

## Blockers
- P185_PRODUCTION_STORAGE_CONFIRMED is not set — local filesystem health alone does not authorize live sends.
- CRON_SECRET / P185_CRON_SECRET is not configured.
- P185_PRODUCTION_AUTOMATION_ENABLED is not set to 1.
- P184 is not enabled in live mode (required for canary execution).

## Setup instructions
1. For an intentional local canary only: set P185_PRODUCTION_STORAGE_CONFIRMED=1 in .env.local after confirming this machine's .data path is the intended durable store for the canary. Do not set this on Vercel without a durable volume.
2. Add CRON_SECRET (or P185_CRON_SECRET) to deployment secrets / .env.local — never commit it. Use Authorization: Bearer <secret> for cron.
3. Set P185_PRODUCTION_AUTOMATION_ENABLED=1 in the production environment after canary authorization.
4. When ready for canary: set P184 enabled=true and mode=live via authorized operator control (not via cron body).

## Warnings
- Live sending will not run unless all gates pass and canary is explicitly authorized.
- The 78 likely-selected candidates remain excluded from this frozen cohort.
- Final dry-run: 25/25 still eligible; 0 newly blocked.
