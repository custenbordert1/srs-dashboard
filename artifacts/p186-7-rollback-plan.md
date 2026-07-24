# P186.7 Rollback Plan

Rollback must not resend paperwork, duplicate MEL exports, delete audit history, or silently overwrite production state.

## pre_paperwork_lifecycle

- **Trigger:** critical mismatch OR canary failure OR operator abort
- **Flag:** P186_ROLLBACK_CONTROLS + clear P186_LIFECYCLE_AUTHORITY_BY_TRANSITION_GROUP for group
- **Previous writer:** api-candidates-workflows / production operators
- **State reconstruction:** Re-read production workflow store as SoR; discard P186 authoritative intent; keep shadow observations
- **Pending ops:** Leave unresolved P186 ops in review queue; do not auto-apply; operator resolves or cancels
- **Audit:** Append rollback audit event; never delete prior p186_* or workflow audits
- **Queues:** Operator queues retained; freeze any in-flight canary cohort
- **Notify:** Surface rollback on cutover dashboard + operator queue banner
- **Verify:** Confirm P186 authority flags off for group; Confirm production workflow SoR unchanged except intentional rollback writes via adapter; Confirm no paperwork send invoked; Confirm audit trail includes rollback event
- **Forbids:** resend paperwork; duplicate MEL exports; delete audit history; silently overwrite production state

## operator_approval

- **Trigger:** approval adapter failure OR audit gap OR operator abort
- **Flag:** P186_ROLLBACK_CONTROLS
- **Previous writer:** p97-approval-mode-persist / api-candidates-workflows
- **State reconstruction:** Restore prior approval status from workflow audit timeline
- **Pending ops:** Cancel pending bulk approval previews; keep conflict review items
- **Audit:** Preserve p186_operator_audit rows
- **Queues:** Keep approval queues; mark canary cohort stopped
- **Notify:** Notify executive/recruiter roles via dashboard
- **Verify:** Approval flags scoped off; No duplicate approvals applied; Audit + queue intact
- **Forbids:** resend paperwork; duplicate MEL exports; delete audit history; silently overwrite production state

## paperwork_send

- **Trigger:** never transfer authority away from P184/P185 incorrectly; abort legacy freeze if send path unhealthy
- **Flag:** P186_ROLLBACK_CONTROLS (re-enable legacy only if P184/P185 unavailable — operator explicit)
- **Previous writer:** p184/p185 (preferred) or legacy send path under dry_run
- **State reconstruction:** Do not invent Paperwork Sent; rely on envelope authority
- **Pending ops:** Hold dry_run queues; never auto-live-send on rollback
- **Audit:** Preserve P185 envelope audits
- **Queues:** P185 runner queues retained
- **Notify:** Paperwork isolation alert on cutover dashboard
- **Verify:** P184/P185 still isolated send authority; No resend of existing envelopes; Mode remains dry_run unless independently authorized
- **Forbids:** resend paperwork; duplicate MEL exports; delete audit history; silently overwrite production state

## post_sign_mel

- **Trigger:** post-sign adapter failure OR MEL queue integrity failure
- **Flag:** P186_ROLLBACK_CONTROLS
- **Previous writer:** api-candidates-workflows / manual MEL process
- **State reconstruction:** Revert Ready for MEL / MEL Export Review via approved adapter only when verified
- **Pending ops:** Keep mel queue rows in pending_review; never call MEL write API
- **Audit:** Preserve p186_5_audit and mel queue history
- **Queues:** MEL export review queue retained
- **Notify:** Post-sign / MEL rollback banner
- **Verify:** Automatic MEL export still disabled; No confirmed_exported invented; Audit + queue preserved
- **Forbids:** resend paperwork; duplicate MEL exports; delete audit history; silently overwrite production state
