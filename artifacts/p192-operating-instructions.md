# P192 Operating Instructions

## Commands

```bash
npm run p192:start    # start supervised continuous runner (this machine only)
npm run p192:status   # print redacted status from .data/p192-supervised-runner-status.json
npm run p192:once     # one live cycle then restore P184 dry_run
npm run p192:stop     # request clean stop + restore P184 dry_run
```

Ctrl+C on the start process performs the same safe shutdown.

## Behavior

- Immediate first cycle, then every **10 minutes**
- Only **Paperwork Needed** candidates with Recommend Hire + Operator Approval evidence
- Dropbox Sign **test_mode=false** (production)
- Max 10 sends/cycle, 4/min, 40/hr, 200/day, concurrency 2, max 3 failures/cycle
- Empty queue: remains running and reports eligible=0
- Never recommends, approves, creates Paperwork Needed, or exports MEL

## Stop

`npm run p192:stop` or Ctrl+C restores **P184 dry_run** and releases the lease/lock.
