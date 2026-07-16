# P207 — Autonomous Readiness Report

Generated: 2026-07-16T14:28:16.918Z

## Dashboard status

- Mode: **read-only**
- Overall health: **58/100** (critical)
- Autonomous readiness: Software ready · Vendor blocked (Dropbox quota)
- Largest blocker: Dropbox production quota (vendor blocked)
- Immediate send-ready: **18**
- Recommendation: **ready for production dashboard**

## Stage counts

| Stage | Count | Δ today | Largest blocker | 2nd blocker | ETA (h) |
| --- | ---: | ---: | --- | --- | ---: |
| Applied | 559 | 116 | Missing AI/operator approval | Missing recruiter | 12 |
| Needs Review | 17 | 8 | Awaiting recruiter review | Missing recruiter | 8 |
| Paperwork Needed | 18 | 11 | Dropbox production quota | — | 24 |
| Paperwork Sent | 230 | 30 | Awaiting signature | — | 48 |
| Signed | 17 | 2 | Ready for MEL blocked | — | 4 |
| Ready for MEL | 0 | 0 | — | — | 0 |
| Rejected | 6 | 0 | — | — | 0 |
| Historical | 0 | 0 | — | — | 0 |

## Subsystem health

| Subsystem | Score | Tone | Detail |
| --- | ---: | --- | --- |
| AI Qualification | 59 | critical | 10 AI/operator-approved signals |
| Lifecycle | 98 | healthy | 18 Paperwork Needed · 17 Needs Review |
| Paperwork Queue | 51 | critical | 18 send-ready · 18 waiting |
| Dropbox | 25 | critical | Vendor blocked: production quota=0 (software ready=true) |
| Status Sync | 75 | warning | API ok |
| Ready for MEL | 40 | critical | 0 ready · 17 signed |

## Dropbox

- Software ready: true
- Vendor blocked: true
- Production quota: 0
- Test mode: false
- API status: ok
- Account: humanresource@srsmerchandising.com
- Templates: 5
- Detail: Vendor blocked: production quota=0 (software ready=true)

## Forecast (if Dropbox restored)

- Expected sends: 18
- Expected signatures: 10
- Expected Ready for MEL: 9
- 24h: 7 / 38 / 41
- 7d: 18 / 136 / 131

## Validation

- Matched: true
- Latency ms: 3
- Mismatches: 0
- Missing data: none

## Safety

- Lifecycle writes: false
- Paperwork Needed creates: false
- Dropbox sends: false
- P192 starts: false
- Automation enabled: false
- MEL writes: false

## Paperwork Needed snapshot

- Count: 18
- Largest blocker: Dropbox production quota
