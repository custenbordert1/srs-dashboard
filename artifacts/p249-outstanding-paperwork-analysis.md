# P249 — Outstanding Paperwork Analysis

**Ops date:** 2026-07-23
**Generated:** 2026-07-23T13:54:54.149Z

## Counts

| Metric | Count |
| --- | ---: |
| Eligible for initial paperwork | 1 |
| Already sent | 496 |
| Outstanding Dropbox signatures | 310 |
| Reminder-eligible (total) | 180 |
| Reminder 1 | 180 |
| Reminder 2 | 0 |
| Reminder 3 | 0 |
| Reminder 4 | 0 |
| Viewed but not signed | 139 |
| Signed | 78 |
| Ready for MEL (incl. verify-signed) | 18 |
| Workflow: Paperwork Needed | 8 |
| Workflow: Paperwork Sent | 496 |

## Blocked by reason

| Reason | Count | Auto-fix? | Manual action |
| --- | ---: | --- | --- |
| initial:already_sent | 68 | yes | None — correctly excluded |
| reminder:invalid_email | 101 | no | Clean invalid emails in Breezy / workflow before reminding |
| reminder:missing_signature_request | 103 | no | Reconcile missing Dropbox signatureRequestId or resend initial packet |
| reminder:cooldown_not_met | 52 | yes | Wait for cadence window — no operator action |
| reminder:signed_or_completed | 78 | yes | None — advance toward MEL verification |
| reminder:status_conflicts | 88 | yes | Re-run P246 with --apply-safe-corrections when authorized |

## Sources

- P242 preview: yes
- P246 preview: yes
- Workflow store: yes
- Reminder store file present: no
