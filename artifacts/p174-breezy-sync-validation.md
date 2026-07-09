# P174 — Breezy Full Synchronization & Ingestion Reliability

Generated: 2026-07-09T14:13:32.681Z

## 1. Executive Summary

- **Parity status:** FAIL
- **Export candidates:** 367
- **Ingestion candidates:** 6
- **Coverage:** 2%
- **Primary bottleneck:** per_position_api_scan_budget
- **Newest 10 in ingestion:** 1/10

## 2. Synchronization Dashboard

| Metric | Value |
|--------|-------|
| Total Breezy positions | 206 |
| Positions scanned | 34 |
| Positions remaining | 172 |
| Candidates in export | 367 |
| Preview retrieved | 7 |
| Fast retrieved | 15 |
| Ingested | 6 |
| Missing vs export | 361 |
| Coverage % | 2% |
| Cycle complete | false |
| Store usable | false |
| Est. chunks remaining | 9 |
| Est. minutes to full sync | 18 |

## 3. Layer Counts

- export: **367**
- apiPreview: **7**
- apiFast: **15**
- ingestionStore: **6**
- workflowStore: **121**
- p157Cohort: **5**
- p171Tracked: **0**

## 4. Pagination Analysis

- Page size: undefined
- Max pages/position: undefined
- Sort: created (newest first per position)
- Concurrency: undefined
- Preview budget: 18000ms
- Fast/full budget: undefinedms

### Stop conditions
- Page returns fewer rows than pageSize
- Scan deadline (server_budget) exceeded
- Preview target candidate count reached
- maxPages per position reached
- Date-range early exit (backfill only)

### Evidence
- Per-position endpoint uses sort=created — page 1 is newest applicants.
- Preview caps at 1 page/position and 18s budget — stops early by design.
- Fast tier scans only first 60 positions per invocation — not all 203.
- Full cycle requires multiple ingestion chunks (20 positions / 110s each).
- No company-wide candidate list API — 203 positions × pagination required for 100% coverage.

## 5. Root Cause Analysis

- **preview_fast_scan**: 361
- **lifecycle_issue**: 5
- **evaluation_scope**: 1

## 6. Bottlenecks (ranked)

### 1. per_position_api_scan_budget (critical)
Preview returns 7, fast 15 vs export 367. Per-position scanning with 18s/115s budgets cannot cover 203 positions in one call.
*Evidence:* Measured preview=7, fast=15, export=367
### 2. incomplete_ingestion_cycle (critical)
Ingestion store has 6 candidates, 34/206 positions scanned, cycleComplete=false.
*Evidence:* store.updatedAt=2026-07-08T21:01:18.910Z, usable=false
### 3. p157_mtd_ingestion_filter (high)
P157 cohort size 5 — MTD + ingested-only filter.
*Evidence:* notEvaluated=362
### 4. p171_empty_lifecycle_store (medium)
P171 lifecycle store has 0 tracked candidates until orchestrator cycles run.
*Evidence:* p171Tracked=0

## 7. Top 25 Newest — Missing Candidate Traces

| Applied | Name | Failure | Category |
|---------|------|---------|----------|
| 2026-07-09T09:08 | april white | api_preview | preview_fast_scan |
| 2026-07-09T04:07 | Gregory Petties | api_preview | preview_fast_scan |
| 2026-07-09T02:08 | Liaunda Lang | api_preview | preview_fast_scan |
| 2026-07-08T21:07 | Mista Clark | api_preview | preview_fast_scan |
| 2026-07-08T20:07 | Norah Jones | api_preview | preview_fast_scan |
| 2026-07-08T19:07 | Jasmine Barber | api_preview | preview_fast_scan |
| 2026-07-08T17:07 | Terry Bryant | api_preview | preview_fast_scan |
| 2026-07-08T14:07 | Patrick Berry | p171_lifecycle | lifecycle_issue |
| 2026-07-08T04:07 | Lindsey Aaron | api_preview | preview_fast_scan |
| 2026-07-08T01:07 | Gianna DelGarbino | api_preview | preview_fast_scan |
| 2026-07-07T23:08 | Nykol Tindle | api_preview | preview_fast_scan |
| 2026-07-07T21:07 | Patricia Irby | api_preview | preview_fast_scan |
| 2026-07-07T19:08 | Darryl T.  Williams | api_preview | preview_fast_scan |
| 2026-07-07T17:08 | Karen Burkes | api_preview | preview_fast_scan |
| 2026-07-07T16:08 | Gabriella Gandy | api_preview | preview_fast_scan |
| 2026-07-07T11:07 | Latrese Crump | api_preview | preview_fast_scan |
| 2026-07-07T10:08 | Monique Franklin | api_preview | preview_fast_scan |
| 2026-07-07T10:07 | Lovett Roberts | api_preview | preview_fast_scan |
| 2026-07-07T08:07 | Tasha Early | api_preview | preview_fast_scan |
| 2026-07-07T01:07 | Rebekah Hoover | api_preview | preview_fast_scan |
| 2026-07-06T21:07 | DEAN B. SERGIACOMI | api_preview | preview_fast_scan |
| 2026-07-06T20:08 | William Gustafson | api_preview | preview_fast_scan |
| 2026-07-06T20:08 | June Ann Stagen | api_preview | preview_fast_scan |
| 2026-07-06T19:08 | Taylor Custenborder | api_preview | preview_fast_scan |
| 2026-07-06T19:07 | William Fields | api_preview | preview_fast_scan |

## 8. Ranked Permanent Fixes

1. **critical** — P174 unscanned-first ingestion queue (implemented) — always scan highest-priority unscanned positions next.
2. **critical** — Run repeated POST /api/candidates/ingestion/sync?complete=true until cycleComplete and candidateCount ≥ export baseline.
3. **high** — Unified applicant-priority sort for preview/fast/ingestion (implemented) — recent activity + applicant count + updated date.
4. **high** — Optional: P154 continuous runner on host (10m interval) for background completion without operator triggers.
5. **medium** — Expand P157 cohort to full ingested set post-backfill (separate phase — out of P174 sync scope).

## 9. Success Criteria

- allPositionsScanned: **FAIL**
- allCandidatesIngested: **FAIL**
- p170DiscoversAll: **FAIL**
- p157EvaluatesEligible: **PASS**
- p171TracksActive: **FAIL**

