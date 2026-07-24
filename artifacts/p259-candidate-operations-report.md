# P259 — Candidate Operations Engine

**Generated:** 2026-07-23  
**Scope:** Convert P258 Hiring Workspace into a full recruiting operations center inside Job Command Center  
**Status:** Implemented (UI + pure logic + unit tests + future hook interfaces)

## Summary

Job Management **View** (Job Command Center → Operations tab) is now a **Candidate Operations Engine**: per-row action bar, review drawer with full profile sections, paperwork / workflow / communications panels, recruiting intelligence badges, quick filters, multi-select bulk ops (no bulk sends), and confirm-gated live writes for assign recruiter / assign DM / move stage via existing `POST /api/candidates/workflows`.

## How to use

1. Start the app (`npm run dev`).
2. Open Recruiting → **Job Management** (`/?tab=job-management`).
3. Click **View** on a job row.
4. Open the **Operations** tab (formerly Applicant Workspace).
5. Use:
   - **Quick filters** (Only Ready, Needs Recruiter/DM/Paperwork, Viewed, Signed, Distance, Missing Phone/Email, Incomplete Identity)
   - **Row action bar**: Review, Send Paperwork, Reminder, Open Breezy, Open Dropbox, Move Stage, Assign Recruiter, Assign DM, Email, Call, SMS, Copy Email, Copy Phone, History
   - **Multi-select** + bulk bar: Assign Recruiter, Assign DM, Preview Paperwork, Preview Reminder, Export
   - **Review drawer** for Summary, Hiring Score / Intelligence, Eligibility, Workflow (move/assign with confirm), Documents / Paperwork, Communications, Notes, Timeline

## Architecture

| Layer | Location | Role |
|-------|----------|------|
| Pure ops logic | `src/lib/p259-candidate-operations/` | Intelligence, filters, bulk helpers, paperwork/workflow models, future hooks |
| Confirm UI | `candidate-operations-confirm-modal.tsx` | Explicit confirmation for every write/preview path |
| Review drawer | `candidate-operations-applicant-drawer.tsx` | Full profile + paperwork + workflow + communications |
| Panel | `job-command-center-panel.tsx` | Operations surface; composes P257/P258 + P259 |
| Live writes | `persistWorkflowUpdate` → `/api/candidates/workflows` | Only after confirm; assign recruiter, assign DM, move stage |

### Safety policy (hard rules)

- `autoWrites: false`
- `bulkSends: false`
- `backgroundActions: false`
- `operatorInitiatedOnly: true`
- Paperwork / reminder: **preview + confirm only** (P260/P261 not wired)
- Allowed live writes (confirm required): `assign_recruiter`, `assign_dm`, `move_stage`

### Future hooks (interfaces only — not implemented)

- `P260LivePaperworkSendHook` — live paperwork send
- `P261ReminderEngineHook` — reminder engine
- `P262RecruitingInboxHook` — recruiting inbox

## What writes require confirm

| Action | Confirm? | Live write? | API |
|--------|----------|-------------|-----|
| Assign Recruiter (row / bulk) | Yes | Yes | `POST /api/candidates/workflows` (`assignedRecruiter`) |
| Assign DM (row / bulk) | Yes | Yes | `POST /api/candidates/workflows` (`assignedDM`) |
| Move Stage | Yes | Yes | `POST /api/candidates/workflows` (`workflowStatus`) |
| Send Paperwork | Yes | **No** | Preview modal only (P260 deferred) |
| Reminder / Resend | Yes | **No** | Preview only (P261 deferred) |
| Bulk Preview Paperwork / Reminder | Yes | **No** | Preview ack only — never sends |
| Export | Yes | **No** | Local CSV download |
| Open Breezy / Dropbox / Email / Call / SMS / Copy | No | No | External / clipboard |

## Performance

- Virtualized applicant list (`computeWindowSlice` from P258) with overscan
- Lazy chunk load (60 rows) before full virtualization window
- Memoized enrich + filter pipelines (`enrichCandidateOpsApplicants`, quick filters, pipeline filter)
- Shell model paints before applicant hydrate (P258 pattern retained)
- Target: 500+ applicants with instant filter toggles on client-side arrays

## Tests

```bash
node --import tsx --test src/lib/p259-candidate-operations/*.test.ts
```

Result (2026-07-23): **12/12 passed**

Coverage:

- Recruiting intelligence (sign/complete probability, days to hire, badges, determinism)
- Quick filters (individual + AND composition + toggle)
- Bulk selection helpers (toggle/select-all/invert/clear/summary)
- Bulk send block + CSV export
- Enrich + write policy (14 row actions, confirm-required writes)

Also registered in `package.json` `test` script: `src/lib/p259-candidate-operations/*.test.ts`

## Screenshots

App redirects to `/login` without a session. Browser screenshots were not captured in this session.

### Manual capture

1. Sign in locally
2. Open `/?tab=job-management` → **View** on a job with applicants
3. Capture:
   - `artifacts/p259-operations-list.png`
   - `artifacts/p259-quick-filters.png`
   - `artifacts/p259-review-drawer.png`
   - `artifacts/p259-confirm-write.png`
   - `artifacts/p259-bulk-bar.png`

## Production write verification

| Path | Verified in code | Runtime verified |
|------|------------------|------------------|
| Confirm modal before `persistWorkflowUpdate` | Yes | Pending (login required) |
| Assign recruiter payload | Yes (`assignedRecruiter`) | Pending |
| Assign DM payload | Yes (`assignedDM`) | Pending |
| Move stage payload | Yes (`workflowStatus`) | Pending |
| Paperwork never calls Dropbox send from panel | Yes | N/A (preview-only) |
| Bulk send blocked by `assertBulkActionAllowed` | Yes (unit tested) | N/A |

After successful live writes, the panel reloads applicant data (`reloadToken`).

## Files

- `src/lib/p259-candidate-operations/*`
- `src/components/recruiting/job-command-center-panel.tsx` (operations surface)
- `src/components/recruiting/candidate-operations-applicant-drawer.tsx`
- `src/components/recruiting/candidate-operations-confirm-modal.tsx`
- `artifacts/p259-candidate-operations-report.md` (this file)
- `package.json` (test glob)

## Safety review

- No automatic / background actions
- No bulk sends
- Every write path shows amber confirm modal
- Paperwork/reminder/resend/audit are preview or acknowledge-only
- Future hooks exported with `wired: false` and no execute path from UI

## GO / NO-GO

**GO for UI + confirm-gated assignment/stage ops** — operators can run day-to-day recruiting actions from Job Command Center without jumping to Breezy/Dropbox/search for most review, assign, stage, contact, and preview workflows.

**NO-GO for live paperwork send / reminder send** — intentionally deferred to P260/P261; do not treat Send Paperwork / Reminder as production delivery.

**Conditional:** Runtime write verification still needs a logged-in operator pass against a non-prod or known-safe candidate before treating assign/stage writes as fully production-certified in this environment.

## Blockers

- Screenshots blocked by login redirect (`/login`).
- Live Dropbox Sign send / reminder / inbox not wired (by design — interfaces only).
- Communications panel is honest when sparse (SMS/manual email/phone notes often placeholders until P262).
