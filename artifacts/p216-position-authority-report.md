# P216 — Position.Location Authority & P214 Revalidation

Generated: 2026-07-17T18:15:59.893Z · Preview only (no freeze, no send, no workflow writes).

## Authority hierarchy

1. Candidate Applied Position ID
2. Breezy Position.Location *(authoritative posting geography)*
3. Candidate Home Location *(coverage distance input)*
4. Market → Territory → DM → Coverage Gate

Title parsing is retained only as `locationSource="job_name"` (diagnostic).
It no longer populates city/state and never drives coverage, DM, distance, or eligibility.

## P215 candidate revalidation

| Candidate | Position.Location | Expected DM | DM correct? | Nearest work | Miles | Tier | Eligibility | Remaining gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `3d272f69061a` | Columbus, OH | Mindie Rodriguez | YES | Columbus, OH | 0 | tier1_0_20 | BLOCKED | blocked_dm_unassigned |
| `c0d00937ae31` | Kansas City, MO | Amy Harp | YES | MERRIAM, KS | 8.3 | tier1_0_20 | BLOCKED | blocked_dm_unassigned |

### Before → After (non-geographic gate)

- `3d272f69061a`: before=[blocked_dm_unassigned, blocked_non_geographic_posting] → after=[blocked_dm_unassigned]
- `c0d00937ae31`: before=[blocked_dm_unassigned, blocked_non_geographic_posting] → after=[blocked_dm_unassigned]

## P214 eligibility re-run (--no-freeze)

| Metric | Count |
| --- | --- |
| Applicants reviewed | 859 |
| Eligible and unsent | 0 |
| Would-be cohort size (not frozen) | 0 |
| Blocked by non-geographic posting | 0 |
| Blocked by DM assignment | 2 |
| Blocked by coverage | 0 |
| Future P214 test batch would contain candidates | NO |
| Both P215 candidates now eligible | NO |

## Active position authority

- Total published positions: 278
- Authoritative Position.Location: 278
- Title-only (diagnostic): 0
- Missing location: 0
- Position.Location resolution success rate: 100%

## Title-parsing inventory

- `src/lib/breezy-job-location.ts` · normalizeBreezyJobLocation (job_name fallback) · **diagnostic_only** — P216: title parse only sets locationSource='job_name'; it no longer populates city/state. Authoritative geography requires Position.Location (or other non-title sources).
- `src/lib/breezy-job-location.ts` · parseLocationFromJobName · **diagnostic_only** — Parser retained for diagnostics and drift detection. Never for coverage/DM/eligibility.
- `scripts/p214-run-unsent-test-batch.ts` · phasePreview · **fixed_in_p216** — Now resolves Applied Position via fetchBreezyPositionById and uses Position.Location only.
- `scripts/p209-run-coverage-audit.ts` · main · **fixed_in_p216** — Uses authoritative posting geography; title parse no longer fills jobCity/jobState for gates.
- `src/lib/p210-recruiting-intelligence/posting-quality.ts` · buildPostingQuality · **fixed_in_p216** — Title parse no longer backfills city/state used for flexible/national geography judgments.
- `src/lib/breezy-job-status-reconciliation/build-job-status-reconciliation.ts` · inferJobFromCandidates · **fixed_in_p216** — No longer invents city/state from position title when live Position.Location is unavailable.
- `src/lib/breezy-job-publish-review/build-job-publish-review.ts` · inferJobFromCandidates · **fixed_in_p216** — No longer invents city/state from position title when live Position.Location is unavailable.

Live grep of P209–P214 production paths: **no remaining `parseLocationFromJobName` call sites**.

Inventory entries still marked must_not_drive_geography: 0

## Safety

- Preview only · paperwork sent: 0 · Dropbox/MEL/Breezy writes: 0 · workflow stage changes: 0
- workflows unchanged=true · ingestion unchanged=true · frozen cohort unchanged=true

