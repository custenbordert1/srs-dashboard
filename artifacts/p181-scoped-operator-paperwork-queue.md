# P181 — Scoped Operator Paperwork Queue

Generated: 2026-07-09T18:09:03.385Z

## Autonomous profile (global pool)

- Global pool: 673
- Eligible: 59
- Projected send (cap): 10
- Top global eligible IDs: 5e64219daaf9, ec0b5c34690e, 71ceb040896c, 09d3013f882d, fe1530a6d2a7, 6557eccb2bc4, d22983e4960d, 8d2f482338ca, 6a850de9dc05, 445225a971f7

## Operator profile (scoped pool)

- Default scope: `{"cohort":"p178_ready","newestApplicants":25}`
- Scoped pool: 20
- P178-ready in store: 20
- Eligible in scope: 20
- Projected send (cap): 10
- Scoped candidate IDs: 5e64219daaf9, 86a8d6804b6b, 80d87b758578, cda9067dac4b, 1bd395fce633, 2419559af1ba, 88bb0f06e75e, 21dc66d94d31, 46551846149e, 445225a971f7, 91faef15d8fd, 98400c5310f6, b32054c06f54, 6a850de9dc05, 6b40ff3b280a, 082c0eec6cff, 1e0fbce8a310, 88340ea1bf94, 71ceb040896c, 27d9e13536b0

## Comparison

- Shared eligible: 20
- Autonomous-only eligible: 39
- Operator-only eligible: 0

## Safety

- P152 safety blockers unchanged — only candidate selection scope differs by profile.
- Operator profile never expands into the global eligible pool when scoped candidates are fewer than send cap.
- Explicit candidateIds take precedence over cohort and filter scope.

