# P257 — Job Command Center Foundation

**Generated:** 2026-07-23  
**Scope:** Read-only Job Detail panel for Job Management  
**Status:** Implemented (UI + metrics builders + unit tests)

## Summary

Job Management **View** no longer opens the simple `JobViewModal`. It opens a multi-tab **Job Command Center** panel with Overview, Applicants, Pipeline, and Activity — composed from existing Breezy catalog rows, candidate snapshots, and durable workflow overlays. No write operations were added.

## How to open

1. Start the app (`npm run dev`).
2. Open Recruiting → **Job Management** (`/?tab=job-management`).
3. Click **View** on any job row.
4. Use tabs: Overview · Applicants · Pipeline · Activity.

## What changed

| Area | Change |
|------|--------|
| UI | New `JobCommandCenterPanel` replaces View modal |
| Table | Existing Job Management table unchanged |
| Metrics lib | `src/lib/p257-job-command-center/` pure builders |
| Edit/Push | Unchanged (still modal-based; panel is read-only) |

### Overview fields

Job Title, Project (Breezy position name), City, State, Published status, Date posted, Last synced, Breezy Job ID, Applicant count, Published/Draft, Description.

### Top metric cards

Applicants, Qualified, Paperwork Needed, Paperwork Sent, Signed, Ready for MEL, Average distance.

## Metrics source (read-only)

1. **Job header** — `JobManagementRow` / Breezy catalog (`/api/job-management/breezy-jobs`).
2. **Applicants** — filter candidates where `positionId` ≡ `breezyJobId` (friendlyId / title fallback via same rules as `buildApplicantCountByBreezyJobId`).
   - Prefer `GET /api/breezy/candidates?position_id=<id>&scan=fast`
   - Also merge Candidates tab cache (`peekTabCandidatesCache` / last-ok snapshot)
3. **Workflow stages** — durable overlay from `GET /api/candidates/workflows`, else derived from Breezy stage via `buildBaselineWorkflowRow`.
4. **Average distance** — explicit `distanceMiles` when present; else `distanceMilesForCandidateToJob` (same travel-radius helper as recruiting intelligence).
5. **Activity** — catalog sync / posted timestamps + applicant workflow `history` + paperwork sent/signed timestamps. Honest when sparse.

## Files

- `src/components/recruiting/job-command-center-panel.tsx`
- `src/components/recruiting/job-management-section.tsx` (View → panel)
- `src/components/recruiting/job-management-modals.tsx` (removed unused `JobViewModal`)
- `src/lib/p257-job-command-center/*`
- `artifacts/p257-job-command-center-report.md` (this file)
- `artifacts/p257-job-command-center-report.json`

## Tests

```bash
node --import tsx --test src/lib/p257-job-command-center/*.test.ts
```

Result (2026-07-23): **6/6 passed** — filter, metrics aggregation, pipeline buckets, panel model props.

## Screenshots

App is listening on `:3000` but redirects to `/login` (auth required). Browser screenshots were not captured in this session.

### Manual capture

1. Sign in locally (`npm run dev` already running on :3000 if present)
2. Open `/?tab=job-management`
3. Click **View** on a published job with applicants
4. Capture each tab and save as:
   - `artifacts/p257-overview.png`
   - `artifacts/p257-applicants.png`
   - `artifacts/p257-pipeline.png`
   - `artifacts/p257-activity.png`

## Constraints honored

- Read-only panel (no status writes, no paperwork sends, no job edits from the panel)
- No commit / push
- Prefer composing existing fetchers over new backends (no new write APIs; optional position_id read on existing candidates route)

## Blockers / notes

- Screenshots blocked by login redirect on `:3000` (`/login?next=%2F`).
- Activity feed may be thin until durable workflow history exists for applicants on the job.
- If Candidates cache is cold and position fetch returns empty, metrics may fall back to catalog applicant count with a data note.
