# Recruiting data flow (Breezy-primary)

This document describes how recruiting data enters the SRS dashboard, what is live vs archive, and where legacy Google Sheet logic remains.

## Primary live sources

| Source | Role | API / path |
|--------|------|------------|
| **Breezy HR** | Jobs, candidates, pipeline stages, job publish/clone | `/api/breezy/jobs`, `/api/breezy/candidates`, job-management drafts |
| **MEL Google Sheet** | Store demand / open calls (not ATS) | `/api/mel-projects` |
| **Workforce CSV** | Active rep roster (`.data/active-reps.json`) | `/api/workforce-intelligence`, `/api/reps/import` |

Breezy sync is **read-only** for candidates. Job pushes create new Breezy positions from local drafts.

## Recruiting Google Sheet (archive)

Controlled by `RECRUITING_SHEET_LIVE_SOURCE` (default `false`). When false, sheet must not drive live KPIs.

| Still uses sheet (reference UI) | Breezy replacement |
|--------------------------------|-------------------|
| Live sheet tab, manager KPI drill-down | `breezyJobsToOverviewRows`, command center |
| DM scorecards (`dm-leaderboard.tsx`) | Breezy jobs + candidates by territory |
| Needs-attention / post-automation queues | Breezy job `candidateCount`, stage filters |
| `/api/recruiting-sheet` | `/api/recruiting/live-snapshot` |

### Legacy lib modules (sheet column mapping)

- `src/lib/sheet-kpi-metrics.ts`
- `src/lib/manager-sheet-stats.ts`
- `src/lib/post-automation.ts`
- `src/lib/recruiting-intelligence.ts` (open-post analytics; also exports candidate match scoring from `recruiting-intelligence/`)

## Active reps

Reps are stored in `.data/active-reps.json` with three buckets:

- `activeRoster` — default for dashboards and matching
- `inactiveArchive` / `terminatedArchive` — excluded unless `includeInactive=true`

| Entry point | Default behavior |
|-------------|------------------|
| `listImportedReps()` | Active roster only |
| `listActiveRosterReps()` | Active roster only |
| `/api/rep-intelligence?includeInactive=true` | Opt-in full archive |
| `buildRepIntelligenceWithGeocoding` | Uses active roster unless `includeInactive` |
| MEL-derived reps | `active` when open assignments > 0 |

Workforce CSV import uses `Status` column (`classifyWorkforceRosterClass`). Supplemental `/api/reps/import` uses `active` boolean → routed through `splitWorkforceReps` on merge.

## Breezy jobs

- **Published** — default for KPIs, DM dashboard, candidate scan positions
- **Draft** — included in job-management catalog (`fetchBreezyJobCatalog`) for clone/post workflows
- **Clone** — `POST /api/job-management/drafts` `{ action: "clone", breezyJobId }` reuses an existing open local draft when one exists for the same Breezy id
- **Push** — creates a **new** Breezy position; draft status becomes `pushed` (prevents double push)

## Breezy candidates

Full scan: paginated per position, 115s server budget, cache keyed by scan params.

Health signals on `/api/breezy/sync-health`:

- `jobSync` — published + draft counts
- `candidateSync` — cache count, truncated flag, positions scanned / available

## DM portal foundation

| Endpoint | Purpose |
|----------|---------|
| `GET /api/dm/dashboard` | Full DM snapshot (Breezy + MEL, territory-filtered) |
| `GET /api/dm/recruiting` | Modular recruiting payload: `?section=jobs,candidates,stores,coverage` |

Territory filtering uses session DM assignment (`applyTerritoryToJobs` / `applyTerritoryToCandidates`).

## Performance notes

- Client caches Breezy reads via `cached-breezy-client.ts` (long TTL)
- Candidate table uses virtual scrolling (`virtual-candidate-table.tsx`)
- Sync-health avoids full candidate scan (cache peek + live job lists)
- MEL sheet loads full CSV — keep MEL tab lazy-loaded

## Environment

See `.env.local.example`: `BREEZY_API_KEY`, `GOOGLE_MEL_PROJECTS_SHEET_ID`, optional `RECRUITING_SHEET_LIVE_SOURCE` for legacy compare mode.
