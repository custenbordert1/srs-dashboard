# P207 Autonomous Readiness Dashboard and Operational Alerts

## Summary
- Read-only Autonomous Readiness Dashboard (P207) with stage counts, blockers, health scores, funnel, forecast, and Dropbox diagnostics.
- P207.1 production hardening: data freshness (Live/Delayed/Stale), in-dashboard operational alerts with dedupe, Dropbox recovery states, auth-guarded API, drill-downs, performance + security validation artifacts.

## Safety
- No lifecycle writes
- No Paperwork Needed creation
- No Dropbox sends
- No P192 start
- No MEL writes
- No external alert notifications (email/SMS/Slack)

## Test plan
- [ ] P207 + P207.1 unit tests pass
- [ ] P204–P206 relevant tests still pass
- [ ] `npm run build` succeeds
- [ ] Authenticated GET returns snapshot with `generatedAt` parity
- [ ] Unauthenticated GET returns 401
- [ ] Vendor-block critical alert visible when quota=0 and send-ready>0
- [ ] Refresh does not create duplicate alert IDs
- [ ] Drill-down returns redacted IDs only
