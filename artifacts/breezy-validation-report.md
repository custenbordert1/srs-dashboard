# P173 — Breezy Production Data Validation & Parity Audit

Generated: 2026-07-09T14:47:40.362Z

Source of truth: `diagnostics/Breezy Info.xlsx`

## Summary

| Metric | Breezy Export | Software | Difference |
|--------|---------------|----------|------------|
| Positions | 206 | 206 (API published) | 0 |
| Candidates | 367 | 237 (union) | 130 |
| Ingestion store | — | 162 | — |
| Workflow records | — | 237 | — |
| Preview scan pool | — | 3 | — |
| Fast scan pool | — | 23 | — |

| Issue | Count |
|-------|-------|
| Candidates missing from software | 206 |
| Positions missing from Breezy API | 29 |
| Not searchable (P170 store) | 206 |
| Missing from ingestion | 206 |
| Missing from discovery | 205 |
| Not in P171 lifecycle | 367 |
| Not evaluated by P157 | 258 |
| Automation blocked | 349 |

## Success criteria

1. Every Breezy position in software? **NO**
2. Every Breezy candidate in software? **NO**
3. Newest immediately discoverable? **YES**
4. Newest searchable? **YES**
5. Newest evaluated by P157? **YES**
6. Newest qualified for automation: **4 / 25**

## Root cause categories

- **candidate_synchronization**: 206

## Top 25 newest candidates

| Applied | Name | Position | Software | Search | P157 | P152 | Missing? |
|---------|------|----------|----------|--------|------|------|----------|
| 2026-07-09T09:08:30.000Z | april white | Independent Merchandiser Needed ‚Äì Atta… | found | P170 store hit | yes | blocked | no |
| 2026-07-09T04:07:39.000Z | Gregory Petties | Retail Field Representative ‚Äì Brinkley… | found | P170 store hit | yes | blocked | no |
| 2026-07-09T02:08:38.000Z | Liaunda Lang | Retail Merchandiser ‚Äì Savannah Metro N… | found | P170 store hit | yes | blocked | no |
| 2026-07-08T21:07:40.000Z | Mista Clark | Independent Merchandiser Needed ‚Äì Atta… | found | P170 store hit | yes | blocked | no |
| 2026-07-08T20:07:57.000Z | Norah Jones | Retail Merchandiser Needed ‚Äì Starkvill… | found | P170 store hit | yes | blocked | no |
| 2026-07-08T19:07:44.000Z | Jasmine Barber | Flexible Retail Merchandiser ‚Äì Mayodan… | found | P170 store hit | yes | blocked | no |
| 2026-07-08T17:07:58.000Z | Terry Bryant | Store Merchandiser Needed ‚Äì Union… | found | P170 store hit | yes | blocked | no |
| 2026-07-08T14:07:21.000Z | Patrick Berry | Neighborhood Retail Merchandiser ‚Äì Dor… | found | P170 store hit | yes | eligible | no |
| 2026-07-08T04:07:21.000Z | Lindsey Aaron | Retail Service Representative ‚Äì Mounta… | found | P170 store hit | yes | blocked | no |
| 2026-07-08T01:07:12.000Z | Gianna DelGarbino | Retail Merchandiser - Youngstown/Warren … | found | P170 store hit | yes | eligible | no |
| 2026-07-07T23:08:05.000Z | Nykol Tindle | Merchandising Specialist ‚Äì Columbus, O… | found | P170 store hit | yes | eligible | no |
| 2026-07-07T21:07:27.000Z | Patricia Irby | Retail Merchandiser - Weekly Store Visit… | found | P170 store hit | yes | blocked | no |
| 2026-07-07T19:08:27.000Z | Darryl T.  Williams | Retail Merchandiser ‚Äì Hanover Shopping… | found | P170 store hit | yes | blocked | no |
| 2026-07-07T17:08:07.000Z | Karen Burkes | Retail Execution Merchandiser ‚Äì Caddo … | found | P170 store hit | yes | blocked | no |
| 2026-07-07T16:08:39.000Z | Gabriella Gandy | Retail Merchandiser Needed ‚Äì Starkvill… | found | P170 store hit | yes | blocked | no |
| 2026-07-07T11:07:15.000Z | Latrese Crump | Retail Reset Merchandiser ‚Äì Battle Cre… | found | P170 store hit | yes | blocked | no |
| 2026-07-07T10:08:29.000Z | Monique Franklin | Retail Merchandiser - Champaign-Urbana T… | found | P170 store hit | yes | eligible | no |
| 2026-07-07T10:07:00.000Z | Lovett Roberts | Flexible Retail Jobs ‚Äì Valdosta… | found | P170 store hit | yes | blocked | no |
| 2026-07-07T08:07:56.000Z | Tasha Early | Retail Merchandiser ‚Äì Lancaster… | found | P170 store hit | yes | blocked | no |
| 2026-07-07T01:07:00.000Z | Rebekah Hoover | Continuity In-Store Merchandiser Taylor,… | found | P170 store hit | yes | blocked | no |
| 2026-07-06T21:07:25.000Z | DEAN B. SERGIACOMI | Merchandising Specialist ‚Äì Millville, … | found | P170 store hit | yes | blocked | no |
| 2026-07-06T20:08:13.000Z | William Gustafson | Retail Service Merchandiser ‚Äì Arcadia… | found | P170 store hit | yes | blocked | no |
| 2026-07-06T20:08:02.000Z | June Ann Stagen | Retail Merchandiser - Danville Retail Co… | found | P170 store hit | yes | blocked | no |
| 2026-07-06T19:08:39.000Z | Taylor Custenborder | Retail Display Merchandiser ‚Äì West Che… | found | P170 store hit | yes | blocked | no |
| 2026-07-06T19:07:46.000Z | William Fields | Retail Service Merchandiser ‚Äì Lumberto… | found | P170 store hit | yes | blocked | no |

## Recommended fixes

- Run P154 full candidate backfill / ingestion sync until ingestion store covers all published positions (currently ~6 candidates vs 367 export).
- P170 search is ingestion-store-first; candidates only in preview/fast scan require P153.2 rescue (name/email) — phone/ID search fails without store hydration.
- P157 decision cohort uses filterMtdCandidates on ingestion store only — non-MTD or non-ingested candidates are never evaluated.
- P171 lifecycle only tracks candidates after lifecycle cycles — empty store means no lifecycle parity until orchestrator runs.
- Position applicant counts in export should be reconciled job-by-job after ingestion catches up.

Full per-candidate audit: `artifacts/breezy-validation-report.json`

