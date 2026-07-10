# P159 — Operations Control Center

Generated: 2026-07-07T19:41:49.856Z

## System Mode

**Manual only** — Manual batches are working (40 sent today). Up to 10 more sends available in the next capped cycle.

## Runner Status

- System mode: **Manual only**
- Continuous enabled: **false**
- Scheduler mode: **simulation**
- Daemon running: **false**
- Autopilot enabled: **false**
- Last cycle: 2026-07-07T15:10:21.366Z
- Next cycle: 2026-07-07T15:20:46.364Z
- Interval: **10 min**
- Uptime: 286m
- Overlap lock: **clear**
- Stale lock warning: **false**

## Today's Production Activity

- Paperwork sent: **40**
- Send batches: **4**
- Signed today: **0**
- Viewed today: **3**
- Pending signatures: **81**
- Duplicates prevented: **0**
- Failures: **0**

### Send times by batch

- Batch 1: **10** sends (2026-07-07T12:19:15.050Z → 2026-07-07T12:19:23.734Z)
- Batch 2: **10** sends (2026-07-07T13:37:33.922Z → 2026-07-07T13:37:42.048Z)
- Batch 3: **10** sends (2026-07-07T14:01:55.066Z → 2026-07-07T14:02:02.188Z)
- Batch 4: **10** sends (2026-07-07T16:52:41.526Z → 2026-07-07T16:52:48.385Z)

## Queue Status

- Candidates evaluated: **546**
- Eligible now: **45**
- Ready after recruiter assignment: **383**
- Ready after workflow transition: **0**
- Waiting on signature: **16**
- Already sent: **0**
- Already signed: **0**
- Duplicates: **36**
- Invalid emails: **0**
- Manual review: **0**
- Blocked: **2**
- Queue remaining: **48**

## Batch History

### P154.4 Backfill & Continuous

- Trigger: **manual**
- Window: 2026-07-07T16:52:41.526Z → 2026-07-07T16:52:48.385Z (6859ms)
- Evaluated: —
- Recruiters assigned: **2**
- Workflow transitions: **0**
- Paperwork sent: **10**
- Failures: **0**

### P154.7 Simulation Cycle

- Trigger: **manual** (dry run)
- Window: 2026-07-07T15:10:21.366Z → 2026-07-07T15:10:46.360Z (24994ms)
- Evaluated: 546
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **0**
- Failures: **0**

### P154.7 Simulation Cycle

- Trigger: **manual** (dry run)
- Window: 2026-07-07T15:09:22.964Z → 2026-07-07T15:10:21.358Z (58394ms)
- Evaluated: 546
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **0**
- Failures: **0**

### P154.7 Simulation Cycle

- Trigger: **manual** (dry run)
- Window: 2026-07-07T15:09:01.224Z → 2026-07-07T15:09:22.955Z (21731ms)
- Evaluated: 546
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **0**
- Failures: **0**

### P154.7 Simulation Cycle

- Trigger: **manual** (dry run)
- Window: 2026-07-07T15:07:42.224Z → 2026-07-07T15:08:04.933Z (22709ms)
- Evaluated: 546
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **0**
- Failures: **0**

### P154.7 Simulation Cycle

- Trigger: **manual** (dry run)
- Window: 2026-07-07T15:06:43.640Z → 2026-07-07T15:07:42.217Z (58577ms)
- Evaluated: 546
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **0**
- Failures: **0**

### P154.7 Simulation Cycle

- Trigger: **manual** (dry run)
- Window: 2026-07-07T15:06:21.512Z → 2026-07-07T15:06:43.633Z (22121ms)
- Evaluated: 546
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **0**
- Failures: **0**

### P154.6 Post-CSV Live Send

- Trigger: **manual**
- Window: 2026-07-07T14:01:55.066Z → 2026-07-07T14:02:02.188Z (7122ms)
- Evaluated: —
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **10**
- Failures: **0**

### P154.4 Backfill & Continuous

- Trigger: **manual**
- Window: 2026-07-07T13:37:33.922Z → 2026-07-07T13:37:42.048Z (8126ms)
- Evaluated: —
- Recruiters assigned: **0**
- Workflow transitions: **0**
- Paperwork sent: **10**
- Failures: **0**

### P154.3 Morning Production Send

- Trigger: **manual**
- Window: 2026-07-07T12:19:15.050Z → 2026-07-07T12:19:23.734Z (8684ms)
- Evaluated: —
- Recruiters assigned: **42**
- Workflow transitions: **0**
- Paperwork sent: **10**
- Failures: **0**

## Safety Checks

- Duplicate protection: **active**
- Active signature protection: **active**
- Invalid email protection: **active**
- Already-sent protection: **active**
- Breezy write protection: **active**
- Caps active: **yes** (10 sends, 25 assignments)
- Stop on error: **yes**

## Continuous Mode

- Enabled: **false**
- UI control: **disabled** (display only)
- Note: Continuous mode requires P154_CONTINUOUS_ENABLED=true on the host and p154.7-continuous-runner --daemon. UI enable is disabled until executive sign-off.

## Recommendation

**Safe to run another capped cycle**

Manual batches are working (40 sent today). Up to 10 more sends available in the next capped cycle.

## Validation

- buildPassed: **true**
- p159TestsPassed: **true**
- p155TestsPassed: **true**
- p154TestsPassed: **true**
- p158TestsPassed: **true**
- continuousEnabled: **false**
- continuousModeRemainsDisabled: **true**
- daemonNotStarted: **true**
- noLiveSendsDuringValidation: **true**
- noWorkflowWrites: **true**
- noBreezyWrites: **true**
- runnerSchedulerMode: **simulation**
- systemMode: **manual_only**

