# P243 Open Store Bulk Paperwork Queue — Final

- Generated: 2026-07-21T19:56:04.268Z
- Mode: **live_batches** (dryRun=false)
- Live writes occurred: **true**
- Dropbox testMode: **true**
- Batches attempted: 2 (size≤5)
- Force auto-advance: true; force fresh-reset: true
- Capacity: remaining=25 safe=20 source=configured_cap
- **STOPPED on system failure:** Batch 2: 1 send(s) lacked confirmed signatureRequestId

## Summary

| Metric | Count |
| --- | ---: |
| Reviewed | 81 |
| Eligible | 6 |
| Already sent | 66 |
| Already signed | 0 |
| Duplicates | 6 |
| Invalid email | 0 |
| Blocked | 75 |
| API remaining | 25 |
| Safe capacity | 20 |
| Would send | 6 |
| Attempted | 8 |
| Confirmed sends | 7 |
| Deferred | 0 |
| Failed | 1 |

## Confirmed sends

| Name | Store | Batch | Confirmed | Sig | Status | Detail |
| --- | --- | ---: | --- | --- | --- | --- |
| Diana Porter | (earlier batch) | 0 | true | 1e1ba2f22a85 | sent | ok |
| Tracy Hedderman | (earlier batch) | 0 | true | 9f15cd23853c | sent | ok |
| Andrew Barnes | BABCOCK RANCH, FL | 1 | true | 33eef61ccf31 | sent | ok |
| Elizabeth Odger | LORTON, VA | 1 | true | 904763d32e28 | sent | ok |
| Johnna Belton | CAMDEN, SC | 1 | true | 4ef4c0acbddb | sent | ok |
| Thomas Hafley | MIDLAND, MI | 1 | true | 396af49ee495 | sent | ok |
| James Daniels | COLUMBIA, SC | 1 | true | dd283f6facf8 | sent | ok |

## Deferred

_None_

## Failures

| Name | Store | Batch | Confirmed | Sig | Status | Detail |
| --- | --- | ---: | --- | --- | --- | --- |
| melissa lloyd | BABCOCK RANCH, FL | 2 | false | — | not_sent | unconfirmed outcome=missing |

## Notes

- Loaded 81 row(s) from sheet "Matches" in /Users/tayloecustenborder/Documents/GitHub/srs-dashboard/artifacts/Open_Store_Candidate_Matches.xlsx
- Parsed 81 candidate match row(s).
- Safe capacity=20 (remaining=25 − reserve=5; source=configured_cap)
- Ingestion store candidates available: 378
- Loaded 276 published Breezy jobs.
- 9 sheet email(s) missing from ingestion — attempting targeted position fetches.
- After targeted fetch, ingestion+live pool size=383.
- Resolved 73/81; ambiguous=0; unresolved=8.
- Classified 81: eligible=6 blocked=75 (dropped 0 duplicate sheet row(s)); wouldSend=6 deferred=0 (safeCapacity=20).
- Raised AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS 1 → 30 for live canary headroom
- Prepared 0/6 candidate(s) for send.
- Batch 1: 5 candidate(s) (cap headroom=20).
- Batch 1 confirmed=5/5; cycle sent=5 failures=0.
- Batch 2: 1 candidate(s) (cap headroom=15).
- Batch 2 confirmed=0/1; cycle sent=0 failures=0.
- Cumulative confirmed across P243 live runs: 7.
- melissa lloyd failed: not in durable ingestion (cycle could not pull); left Paperwork Needed without packet.

## Warnings

- Production account quota=0 but Dropbox testMode=true — using DROPBOX_SIGN_SAFE_SEND_CAP=25 as conservative test-mode capacity.
- Batch 2: 1 send(s) lacked confirmed signatureRequestId

