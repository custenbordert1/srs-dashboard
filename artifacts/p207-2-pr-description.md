# P207 Autonomous Readiness Dashboard and Operational Alerts

## Summary

- **P207** — Read-only executive Autonomous Readiness Dashboard: stage counts, blockers, subsystem health scores, funnel, forecast, Dropbox diagnostics (Software Ready vs Vendor Blocked), drill-downs.
- **P207.1** — Production hardening: Live/Delayed/Stale freshness, in-dashboard operational alerts with fingerprint dedupe, Dropbox recovery states, auth-guarded API, performance/security validation.
- **P207.2** — Minimal typing fix in `merge-candidate-record.ts`: normalize `scrubDemoOwnershipSignals` `null` → `undefined` so it matches `BreezyCandidate.ownershipSignals`. No ownership, lifecycle, Dropbox, or MEL behavior changes.

## Safety

- No lifecycle writes
- No Paperwork Needed creation
- No Dropbox sends
- No P192 / automation enablement
- No MEL writes
- Alerts are in-dashboard only (no email/SMS/Slack)

## Verified signals

- Authoritative reconciliation: **847/847**, 0 mismatches
- Overall readiness health: **58/100** (critical due to vendor block)
- Software ready · Vendor blocked
- Dropbox production quota: **0**
- Immediate send-ready: **18**
- Alert dedupe + freshness states implemented

## Known vendor blocker

Dropbox `api_signature_requests_left = 0` while send-ready candidates wait. Quota restore requires supervised P206 pilot — no auto-send.

## Test plan

- [x] P207 + P207.1 unit tests (15/15)
- [x] P204–P207 regression (48/48)
- [x] P188.4 ownership durability
- [x] P203.2 demo ownership cleanup
- [x] merge-candidate-record typing cleared
- [ ] Full `npm run build` green — remaining pre-existing blocker in `p201-3/.../gates.ts:188` (out of P207.2 scope; clear before merge if CI requires build)

## Out of scope for this PR

Unrelated P185–P206 WIP, `.data/`, env files, Dropbox payloads, candidate PII.
