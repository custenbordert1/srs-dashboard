# P215 — Breezy Position Resolution Audit

Generated: 2026-07-17T18:02:51.349Z · Read-only investigation (no MEL / Breezy / Dropbox writes, no workflow changes).

## Scope

P214 blocked 2 candidate(s) for posting-location reasons
(`blocked_non_geographic_posting`, covering both NON_GEOGRAPHIC_POSTING and
MISSING_JOB_LOCATION: the title parse produced no city/state). Each was
re-audited by resolving the applied Breezy Position object directly.

## Per-candidate resolution

| Candidate | Applied position | Position status | Position.Location | Root cause | P214 correct? |
| --- | --- | --- | --- | --- | --- |
| `3d272f69061a` | Retail Merchandiser (Flexible, Project-Based Work) (`73048dbe5519`) | closed | Columbus, OH (location.city+location.state) | POSITION_LOCATION_PRESENT | **NO** |
| `c0d00937ae31` | Retail Merchandiser (Flexible, Project-Based Work) (`f2ca3cdaeee8`) | closed | Kansas City, MO (location.city+location.state) | POSITION_LOCATION_PRESENT | **NO** |

### Why P214 was wrong (where applicable)

- `3d272f69061a`: Automation parsed the position title instead of resolving Position.Location. The applied Breezy position carries a valid location (Columbus, OH); classifying it as NON_GEOGRAPHIC_POSTING was wrong.
- `c0d00937ae31`: Automation parsed the position title instead of resolving Position.Location. The applied Breezy position carries a valid location (Kansas City, MO); classifying it as NON_GEOGRAPHIC_POSTING was wrong.

## Active position metadata audit

| Metric | Count |
| --- | --- |
| Total active (published) positions | 278 |
| Positions with valid location (city + state) | 278 |
| Positions without a full location | 0 |
| Flexible postings (by title) | 24 |
| National postings (by title) | 0 |
| Positions missing city | 0 |
| Positions missing state | 0 |
| Locations derived only from the job title | 0 |

Location source distribution: {"location.city+location.state":278}

## Recommended authoritative hierarchy

```
Applied Position ID  →  Position.Location (authoritative posting geography)
        ↓ (coverage inputs)
Candidate Home Location  →  distance to active work
        ↓ (routing)
Market → Territory → DM → Coverage Gate
```

- `Position.Location` is the authoritative source for posting geography. It was
  present on every position audited here, including postings whose titles carry
  no city/state.
- Title parsing should **never** gate sends or coverage decisions. It may remain
  as a tagged, low-confidence diagnostic (`locationSource='job_name'`) for
  drift detection only.
- Candidate home location remains the coverage-distance input; posting geography
  routes market → territory → DM before the coverage gate.

## Title-parsing inventory (no code changed)

### `src/lib/breezy-job-location.ts`
- Function: normalizeBreezyJobLocation (job_name fallback, ~lines 309–315)
- Reason: Last-resort fallback parses the position title when location/address/region fields are empty.
- Suggested replacement: Keep as diagnostics-only: the result is already tagged locationSource='job_name' — downstream gates must treat that tag as low-confidence instead of equal to Position.Location.

### `scripts/p214-run-unsent-test-batch.ts`
- Function: phasePreview (parseLocationFromJobName on ingestion positionName)
- Reason: P214 derived posting geography from the stored position title and never resolved the applied Breezy Position object.
- Suggested replacement: Resolve candidate.positionId via fetchBreezyPositionById and use Position.Location (job.city/job.state, locationSource != 'job_name'); fall back to title parsing only as explicit low-confidence evidence.

### `scripts/p209-run-coverage-audit.ts`
- Function: main (parseLocationFromJobName fallback for applied job location)
- Reason: Coverage audit parses the position name when the Breezy jobs catalog lacks the position (e.g. closed positions missing from the published list).
- Suggested replacement: Fetch the specific position by id (fetchBreezyPositionById works for closed positions) before falling back to the title.

### `src/lib/p210-recruiting-intelligence/posting-quality.ts`
- Function: buildPostingQuality (parseLocationFromJobName on p.name)
- Reason: Posting-quality scoring judges geography from the title.
- Suggested replacement: Use the position's normalized city/state + locationSource from the jobs snapshot; score 'title parseable' separately from 'has Position.Location'.

### `src/lib/breezy-job-status-reconciliation/build-job-status-reconciliation.ts`
- Function: buildJobStatusReconciliation (parseLocationFromJobName)
- Reason: Reconciliation compares title-derived location with stored fields.
- Suggested replacement: Compare against Position.Location fields; keep title parse only to flag title/location drift.

### `src/lib/breezy-job-publish-review/build-job-publish-review.ts`
- Function: buildJobPublishReview (parseLocationFromJobName)
- Reason: Publish review derives expected location from the draft title.
- Suggested replacement: Validate the draft's location block directly and require city+state before publish, instead of accepting a parseable title.

## Safety

- Read-only: workflows file unchanged=true, ingestion file unchanged=true
- MEL writes: 0 · Breezy writes: 0 · Dropbox writes: 0 · Workflow stage changes: 0

