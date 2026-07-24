# P240 — Autonomous New Applicant Pipeline (Continuous Mode)

Generated: 2026-07-21T13:43:33.417Z
Mode: **dry_run_only** (DRY RUN ONLY)
Phase: P240

## Cutoff (new applicants only)

- Cutoff ISO: **2026-07-20T21:06:46.975Z**
- Source: P239 final remaining auto-eligible send completion (artifacts/p239-sent.json generatedAt); file=artifacts/p239-sent.json
- P239 generatedAt: 2026-07-20T21:06:46.975Z
- Max P239 appliedDate: 2026-07-15T11:31:13.254Z
- Prior sent exclusions (union): **47** (p221=2 p227=3 p235=5 p237=5 p238=25 p239=7)

## Pipeline health

- Health score: **66/100** (grade D)
- GO / NO-GO: **NO-GO**
- Reason: Health score 66/100 with auto-clear 29.4% is below the threshold for continuous unattended operation (need ≥70 health and stronger auto-clear). Dominant bottleneck: qualification_gate_failed.
- Live-mode recommendation: Do not enable live autonomous sends. Continue dry-run only; fix dominant blockers (especially qualification / P65.6 grade gates and 40–60 mi review) and re-run P240.

### Health factors

| Factor | Score | Weight | Note |
| --- | ---: | ---: | --- |
| auto_clear_rate | 29.4 | 0.35 | 29.4% of simulated new arrivals would reach Paperwork Sent |
| explicit_blockers | 100 | 0.2 | Every blocked candidate has blocker code + next action + queue location |
| never_resend_protection | 100 | 0.15 | Prior-batch and already-sent/signed candidates are protected skips |
| ingestion_coverage | 90 | 0.15 | 244 arrivals in 14d (~17.4/day) |
| bottleneck_concentration | 50 | 0.15 | Top blocker: qualification_gate_failed (66.7%) |

## Throughput (next 24h simulation)

- Arrivals last 14d: **244**
- Estimated daily arrival rate: **17.4/day**
- Projected arrivals next 24h: **17**
- Proxy cohort walked: **17** (labeled simulation_proxy_24h)
- Would reach Paperwork Needed: **5**
- Would send (Dropbox simulated): **5**
- Blocked (explicit): **12**
- Protected skip: **0**
- Auto-clear rate: **29.4%**
- Estimated daily throughput → PN/Sent: **5.1/day**
- Average Applied → Paperwork (sim): **50 min** (0.83 h)

## Live monitoring dashboard

| Queue | Count |
| --- | ---: |
| New applicants waiting | 0 |
| Awaiting recruiter | 0 |
| Awaiting qualification | 8 |
| Awaiting DM | 0 |
| Paperwork Needed / would reach | 0 |
| Sending | 0 |
| Sent today (sim would-send) | 5 |
| Failed today | 0 |
| Blocked candidates | 4 |
| Protected already sent | 0 |
| Real new post-cutoff | 0 |
| Simulation proxy count | 17 |

## Remaining bottlenecks

- qualification_gate_failed (8, 66.7%)
- manual_review_40_60 (2, 16.7%)
- duplicate_identity (1, 8.3%)
- missing_phone (1, 8.3%)

## Dry-run / zero-write confirmation

- Durable writes: **0**
- Dropbox Sign calls: **0**
- Stage changes: **0**
- Recruiter ownership changes: **0**
- DM assignment changes: **0**
- Zero-write audit unchanged: **true**
- Fingerprinted paths: .data/candidate-workflows.json, .data/candidate-ingestion.json, .data/p226-candidate-recovery-store.json, .data/p230-routing-recovery-store.json

## Tests

- Tests run: **11**
- Tests passed: **11**

## Artifacts

- `artifacts/p240-autonomous-pipeline-report.md`
- `artifacts/p240-live-dashboard.json`
- `artifacts/p240-blocked-candidates.json`
- `artifacts/p240-pipeline-health.json`
- `artifacts/p240-throughput.json`
- `artifacts/p240-zero-write-audit.json`

## Confirmation

P240 executed in DRY RUN ONLY. No Dropbox Sign, no workflow stage mutations, no recruiter ownership changes, no DM assignment writes, no commit/merge/push/deploy.

