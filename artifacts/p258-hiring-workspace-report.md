# P258 — Interactive Hiring Workspace

**Generated:** 2026-07-23  
**Scope:** Upgrade P257 Job Command Center into an operator-driven hiring workspace  
**Status:** Implemented (UI + pure builders + unit tests)  
**Verdict:** **GO** (preview-only paperwork; no production writes from this panel)

## Summary

Job Management **View** now opens an **Interactive Hiring Workspace** (built on P257). Operators can review applicants, inspect eligibility (production P84 gates), sort/filter the pipeline, and **preview** Send Paperwork — without automatic stage moves, paperwork sends, or background writes.

## How to use

1. Start the app (`npm run dev`).
2. Open Recruiting → **Job Management** (`/?tab=job-management`).
3. Click **View** on any job row.
4. Tabs: Overview · **Applicant Workspace** · Pipeline · Activity.
5. Per row: **Review** (drawer), **Send Paperwork** (preview modal — confirm does **not** send), Open Breezy / Dropbox Sign, Email, Copy email/phone.
6. Pipeline cards and summary ribbon stages are clickable filters into the Applicant Workspace.

## Hard rules honored

| Rule | Status |
|------|--------|
| No production candidate data writes unless operator confirms | **Pass** — no write APIs called from this panel |
| No automatic paperwork / stage / background writes | **Pass** |
| Send Paperwork = preview + confirmation only | **Pass** — `liveSendWired: false`; confirm shows toast only |
| Everything operator-initiated | **Pass** |

### Send Paperwork policy (explicit)

Live Dropbox Sign send paths exist elsewhere (Candidates workspace / controlled send engines). **P258 deliberately does not wire those APIs** from Job Detail to avoid accidental production packets. The modal shows candidate, template, recipient, eligibility gates, and action=`preview_only`. Confirming acknowledgment does **not** call send endpoints.

## Architecture

```
JobManagementSection View
  └─ JobCommandCenterPanel (P258 UI)
       ├─ buildHiringWorkspaceModel (pure)
       │    ├─ hiring score + sort
       │    ├─ summary ribbon
       │    ├─ pipeline buckets (clickable filters)
       │    ├─ eligibility via buildPaperworkSendEligibility (P84)
       │    └─ activity timeline
       ├─ HiringWorkspaceApplicantDrawer
       └─ HiringWorkspacePaperworkPreviewModal (preview-only)
```

### Hiring Score (0–100)

Deterministic weighted factors: distance, stage, recruiter, DM, phone, email, identity, duplicate, coverage, qualification, existing paperwork, signed. Pure function in `src/lib/p258-hiring-workspace/hiring-score.ts`.

### Sort order

1. Ready for Paperwork (`Paperwork Needed` or `actionType=send-paperwork`)  
2. Highest Hiring Score  
3. Most recent `appliedDate`

### Eligibility

Reuses `buildPaperworkSendEligibility` (production gates). Maps to **Eligible / Blocked / Needs Attention**:

- Hard fail (email, duplicate, signed, rejected, inactive) → **Blocked**
- Soft-only fail (recruiter, paperwork_needed, send action, published job, template) → **Needs Attention**
- All pass → **Eligible**

## Performance

- Panel paints a shell model immediately; applicants hydrate async (target &lt;500ms shell).
- Applicants lazy-load in chunks of 40.
- Lightweight windowing (`computeWindowSlice`) — no new virtualization dependency (none present in package.json).

## Files changed / added

| Path | Role |
|------|------|
| `src/lib/p258-hiring-workspace/*` | Pure builders, score, sort, eligibility, windowing |
| `src/components/recruiting/job-command-center-panel.tsx` | Interactive workspace UI |
| `src/components/recruiting/hiring-workspace-applicant-drawer.tsx` | Review drawer |
| `src/components/recruiting/hiring-workspace-paperwork-preview.tsx` | Preview modal |
| `src/components/recruiting/job-management-section.tsx` | Pass `breezyCompanyId` for Breezy deep links |
| `package.json` | Register P258 tests |
| `artifacts/p258-hiring-workspace-report.md` | This report |

## Tests

```bash
node --import tsx --test src/lib/p258-hiring-workspace/*.test.ts
```

Result (2026-07-23): **12/12 passed** — hiring score, sort, eligibility mapping (Eligible/Blocked/Needs Attention + production gates), pipeline filters, workspace model write policy, windowing.

Also re-ran P257: **6/6 passed** (18/18 combined).

## Screenshots

App on `:3000` redirects to `/login` (auth required). Browser screenshots were **not** captured in this session.

### Manual capture

1. Sign in locally
2. Open `/?tab=job-management` → **View** on a job with applicants
3. Capture:
   - `artifacts/p258-ribbon-applicants.png`
   - `artifacts/p258-review-drawer.png`
   - `artifacts/p258-paperwork-preview.png`
   - `artifacts/p258-pipeline-filter.png`
   - `artifacts/p258-activity.png`

## Blockers

- Screenshots blocked by login redirect (`/login?next=%2F`).
- Open Breezy requires catalog `companyId` + position id; toast if missing.
- Open Dropbox Sign requires `signatureRequestId`; disabled otherwise.
- Activity / email events remain sparse until durable history exists.

## GO / NO-GO

**GO** for operator use as a read + preview hiring workspace on Job Detail.

**NO-GO** for live paperwork sending from this panel until an explicit follow-up wires confirm → existing send APIs behind the same production gates and operator confirmation phrase used elsewhere.
