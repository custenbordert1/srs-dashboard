# P185.1 — Paperwork Eligibility Recovery

Generated: 2026-07-10T16:46:02.094Z
Live ready: **false**

## Root cause (528 job mismatches)
- Most unmatched IDs are closed/historical Breezy positions not present in the published-only job map used by P184/P185.
- P185 built jobsByPositionId from published jobs keyed only by jobId in some paths; closed ads and friendlyId aliases were not applied.
- Zero candidates currently have workflowStatus Paperwork Needed — Applied is not positive hiring-selection evidence.

## Mapping coverage
- Before unmatched: 528
- After unresolved: 209
- Before matched: 149
- After matched: 468
- Coverage after: 69.1%

## Envelope reconciliation
- Attempted: 132
- Replacement review: 0
- Unresolved: 0
- By lifecycle: {"confirmed_sent":59,"signed":25,"viewed":48}

## Classifications
- already_active_packet: 107
- paperwork_completed: 25
- eligible_new_packet: 0
- eligible_replacement_packet: 0
- awaiting_hiring_approval: 0
- applied_not_selected: 330
- unresolved_job: 209
- ambiguous_candidate_state: 0
- invalid_contact: 0
- withdrawn_or_archived: 6
- hired_no_action: 0
- blocked_other: 0

## Corrected dry-run
- Evaluated: 677
- Eligible (P184): 0
- Rejected: 677
- Queue depth: 0
- Est. clearance: 0 min
- Projected / hour: 0
- Projected / day: 0

## Comparison
- Eligible before → after: 0 → 0
- Unmatched jobs before → unresolved after: 528 → 209

## Live blockers
- CRON_SECRET / P185_CRON_SECRET not configured.
- P185_PRODUCTION_AUTOMATION_ENABLED is not set (intentional for this phase).
- P184 remains enabled=false / mode=dry_run (intentional — do not auto-enable).

## Controlled limits
```json
{
  "cadence": "*/10 * * * *",
  "maxSendsPerCycle": 10,
  "maxPerMinute": 4,
  "maxPerHour": 40,
  "maxPerDay": 200,
  "concurrentSends": 2,
  "maxFailuresPerCycle": 3
}
```

## Activation steps
1. Operator-review cohort buckets A/B/C/D in local secured review file
2. Set CRON_SECRET or P185_CRON_SECRET in deployment (never commit)
3. Confirm durable storage (P185_DURABLE_DATA_DIR on serverless)
4. Confirm Dropbox Sign + templates
5. Advance/approve hiring for awaiting_hiring_approval candidates as needed
6. Re-run P185.1 dry-run until eligible cohort matches operator approval
7. Enable P184 enabled=true with mode=dry_run, then mode=live only after gates green
8. Set P185_PRODUCTION_AUTOMATION_ENABLED=1 only after operator sign-off
