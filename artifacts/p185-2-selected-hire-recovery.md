# P185.2 — Selected-Hire Recovery

Generated: 2026-07-10T17:00:27.786Z
Live ready: **false**

## Evidence sources inspected
- **p97_approval_mode_production** (authoritative): Executive/operator persisted approval to Paperwork Needed
- **p83_candidate_workflow_audit** (authoritative): Executed send-paperwork advancements only (shouldAdvance=true)
- **p83_recommendations** (supporting): Recommendations without execution — do not authorize alone
- **p158_workflow_transition_audit** (authoritative): Post-assignment production transitions to Paperwork Needed
- **p181_scoped_operator_paperwork_queue_artifact** (authoritative): Operator-scoped paperwork queue membership
- **onboarding_paperwork_funnel_promotion** (supporting): Policy funnel promotions — informational/supporting only
- **p152_immediate_paperwork_policy** (informational): Send-policy gate after selection — not hire selection
- **p87_hiring_decisions_preview** (informational): Preview recommendations only — never authorize
- **google_recruiting_sheet** (informational): Archive/reference — not wired as selection evidence
- **breezy_workflow_current_stage** (authoritative): Exact Selected/Approved/Paperwork Needed stages when present

## Counts
- evaluated: 677
- withAuthoritativeEvidence: 65
- recoveredFromP181: 20
- recoveredFromP83Executed: 19
- recoveredFromP97: 32
- recoveredFromP158: 21
- normalizedToPaperworkNeeded: 25
- eligibleNewPackets: 25
- templateBlocked: 0
- unresolvedSelectedJobs: 0
- needsOperatorConfirmation: 78
- activePackets: 115
- completedPackets: 17
- queueDepth: 25
- duplicatesPrevented: 132

## Comparison
- Eligible: 0 → 25
- Queue depth: 0 → 25

## Projection
- ~3 cycles / 1 h / 1 day(s) at configured caps
- Cadence bottleneck: 3 cycles × 10 min ≈ 0.5 h
- Hourly cap 40/h → ≥ 1 h
- Daily cap 200/day → ≥ 1 day(s); 0 deferred past day 1
- Per-minute cap 4/min and concurrent=2 further smooth bursts within each cycle
- Circuit breaker stops a cycle after 3 failures — failed sends preserve queue for retry

## Classifications
- applied_not_selected: 436
- verified_selected_existing_packet: 115
- likely_selected_needs_review: 78
- verified_selected_completed_packet: 17
- verified_selected_new_packet: 25
- blocked_other: 6

## Live blockers
- P184 remains enabled=false / mode=dry_run (intentional).
- P185_PRODUCTION_AUTOMATION_ENABLED is not set (intentional).
- CRON_SECRET / P185_CRON_SECRET not configured.

## Activation steps
1. Review secured operator cohorts A–E and I in .data/p185-2-selected-hire-operator-review-local.json
2. Confirm template readiness for any bucket-B candidates
3. Resolve jobs for bucket-C selected candidates
4. Operator-confirm bucket-D likely-selected candidates if appropriate
5. Set CRON_SECRET in deployment (never commit)
6. Confirm durable storage + Dropbox Sign
7. Re-run P185.2 dry-run; enable P184 dry_run then live only after gates green
8. Set P185_PRODUCTION_AUTOMATION_ENABLED=1 last
