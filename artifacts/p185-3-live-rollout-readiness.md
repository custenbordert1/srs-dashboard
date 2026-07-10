# P185.3 — Controlled Live Rollout Readiness

Generated: 2026-07-10T19:20:29.216Z
Rollout ID: p1853-20260710-b419512d
Phase: **backlog_releasing**
Live ready: **true**
Canary may execute: **false**

## Frozen cohort
- Count: 25
- Still eligible: 20
- Newly blocked: 5

## Gates
- cronSecretConfigured: OK
- productionAutomationEnabled: OK
- durableStorageHealthy: OK
- durableStorageNotTmp: OK
- dropboxSignConfigured: OK
- templateConfigured: OK
- p184EnabledForLive: OK
- p184ModeLive: OK
- killSwitchInactive: OK
- circuitBreakerClosed: OK
- leaseAvailable: OK
- canaryAuthorized: BLOCKED
- productionStorageConfirmed: OK

## Blockers
- None

## Setup instructions

## Warnings
- Live sending will not run unless all gates pass and canary is explicitly authorized.
- The 78 likely-selected candidates remain excluded from this frozen cohort.
- Final dry-run: 20/25 still eligible; 5 newly blocked.
