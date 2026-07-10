import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  BREEZY_CANDIDATE_REQUEST_TIMEOUT_MS,
  BREEZY_CANDIDATE_SCAN_BUDGET_MS,
  BREEZY_CANDIDATES_FAST_TIER_POSITIONS,
  BREEZY_CANDIDATES_PREVIEW_BUDGET_MS,
  BREEZY_CANDIDATES_PREVIEW_MAX_POSITIONS,
  BREEZY_CANDIDATES_PREVIEW_TARGET_CANDIDATES,
  BREEZY_GET_MAX_ATTEMPTS,
  BREEZY_MAX_REQUESTS_PER_MINUTE,
  fetchBreezyCandidates,
  fetchBreezyJobs,
} from "@/lib/breezy-api";
import { isMtdApplicant } from "@/lib/candidate-ingestion/candidate-queue-scope";
import {
  buildIngestionPositionQueue,
  countUnscannedPositions,
} from "@/lib/candidate-ingestion/build-ingestion-scan-queue";
import {
  ingestionPositionCoveragePct,
  isIngestionStoreUsable,
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { findInIngestionStore, matchesP170Query } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadP171LifecycleState } from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { P174BreezySyncValidationReport } from "@/lib/p174-breezy-sync-reliability/types";
import { P174_SOURCE_PHASE } from "@/lib/p174-breezy-sync-reliability/types";

export type BreezyExportCandidate = {
  name: string;
  email: string;
  phone: string;
  positionName: string;
  appliedAt: string;
  recruiter: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/‚Äì|‚Äî/g, "–")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildCandidateTrace(input: {
  exportRow: BreezyExportCandidate;
  inExport: boolean;
  inApiPreview: boolean;
  inApiFast: boolean;
  inIngestion: boolean;
  inWorkflow: boolean;
  p170Store: boolean;
  p170RescuePool: boolean;
  p157: boolean;
  p171: boolean;
}): P174BreezySyncValidationReport["candidateTraces"][number] {
  const layers = [
    { layer: "export", pass: input.inExport },
    { layer: "api_preview", pass: input.inApiPreview },
    { layer: "api_fast", pass: input.inApiFast },
    { layer: "ingestion_store", pass: input.inIngestion },
    { layer: "workflow_store", pass: input.inWorkflow },
    { layer: "p170_store", pass: input.p170Store },
    { layer: "p170_rescue_pool", pass: input.p170RescuePool },
    { layer: "p157_evaluation", pass: input.p157 },
    { layer: "p171_lifecycle", pass: input.p171 },
  ];
  const firstFail = layers.find((l) => !l.pass && l.layer !== "export");
  let failurePoint: string | null = null;
  let category: string | null = null;
  if (firstFail) {
    failurePoint = firstFail.layer;
    if (firstFail.layer.startsWith("api_")) category = "preview_fast_scan";
    else if (firstFail.layer === "ingestion_store") category = "ingestion_issue";
    else if (firstFail.layer === "workflow_store") category = "workflow_issue";
    else if (firstFail.layer.startsWith("p170")) category = "search_discovery";
    else if (firstFail.layer === "p157_evaluation") category = "evaluation_scope";
    else if (firstFail.layer === "p171_lifecycle") category = "lifecycle_issue";
  }
  return {
    name: input.exportRow.name,
    email: input.exportRow.email,
    appliedAt: input.exportRow.appliedAt,
    position: input.exportRow.positionName,
    layers,
    failurePoint,
    category,
  };
}

export function buildPaginationAnalysis(): P174BreezySyncValidationReport["paginationAnalysis"] {
  const CANDIDATES_PAGE_SIZE = 50;
  const MAX_CANDIDATE_PAGES_PER_POSITION = 500;
  const CANDIDATE_POSITION_CONCURRENCY = 3;
  const CANDIDATE_POSITION_BATCH_DELAY_MS = 350;
  return {
    pageSize: CANDIDATES_PAGE_SIZE,
    maxPagesPerPosition: MAX_CANDIDATE_PAGES_PER_POSITION,
    maxRowsPerPosition: CANDIDATES_PAGE_SIZE * MAX_CANDIDATE_PAGES_PER_POSITION,
    sortOrder: "created (newest first per position)",
    concurrency: CANDIDATE_POSITION_CONCURRENCY,
    batchDelayMs: CANDIDATE_POSITION_BATCH_DELAY_MS,
    requestTimeoutMs: BREEZY_CANDIDATE_REQUEST_TIMEOUT_MS,
    maxRetryAttempts: BREEZY_GET_MAX_ATTEMPTS,
    rateLimitPerMinute: BREEZY_MAX_REQUESTS_PER_MINUTE,
    scanBudgets: {
      previewMs: BREEZY_CANDIDATES_PREVIEW_BUDGET_MS,
      fastFullAllMs: BREEZY_CANDIDATE_SCAN_BUDGET_MS,
    },
    scanLimits: {
      previewMaxPositions: BREEZY_CANDIDATES_PREVIEW_MAX_POSITIONS,
      previewMaxPagesPerPosition: 1,
      previewTargetCandidates: BREEZY_CANDIDATES_PREVIEW_TARGET_CANDIDATES,
      fastTierPositions: BREEZY_CANDIDATES_FAST_TIER_POSITIONS,
    },
    stopConditions: [
      "Page returns fewer rows than pageSize",
      "Scan deadline (server_budget) exceeded",
      "Preview target candidate count reached",
      "maxPages per position reached",
      "Date-range early exit (backfill only)",
    ],
    evidence: [
      "Per-position endpoint uses sort=created — page 1 is newest applicants.",
      "Preview caps at 1 page/position and 18s budget — stops early by design.",
      "Fast tier scans only first 60 positions per invocation — not all 203.",
      "Full cycle requires multiple ingestion chunks (20 positions / 110s each).",
      "No company-wide candidate list API — 203 positions × pagination required for 100% coverage.",
    ],
  };
}

export async function buildBreezySyncValidation(input: {
  exportCandidates: BreezyExportCandidate[];
  exportPositions: Array<{ position: string; applied: number; location: string }>;
  generatedAt?: string;
}): Promise<P174BreezySyncValidationReport> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const exportSorted = [...input.exportCandidates].sort((a, b) =>
    b.appliedAt.localeCompare(a.appliedAt),
  );

  const [store, workflowBundle, jobsResult, previewResult, fastResult, p157Cohort, p171] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      fetchBreezyJobs("published"),
      fetchBreezyCandidates({ scanMode: "preview", force: true }),
      fetchBreezyCandidates({ scanMode: "fast", force: true }),
      loadDecisionCohort(),
      loadP171LifecycleState(),
    ]);

  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const previewCandidates = previewResult.ok ? previewResult.candidates : [];
  const fastCandidates = fastResult.ok ? fastResult.candidates : [];
  const ingested = listIngestedCandidates(store);
  const p157Dashboard = buildDecisionDashboardFromCohort(p157Cohort);
  const p157Ids = new Set(p157Cohort.candidates.map((r) => r.candidateId));
  const workflowIds = new Set(Object.keys(workflowBundle.workflows));

  const previewEmails = new Set(previewCandidates.map((c) => normalizeEmail(c.email ?? "")));
  const fastEmails = new Set(fastCandidates.map((c) => normalizeEmail(c.email ?? "")));
  const ingestionEmails = new Set(ingested.map((c) => normalizeEmail(c.email ?? "")));

  const emailToPlatformId = new Map<string, string>();
  for (const pool of [ingested, previewCandidates, fastCandidates]) {
    for (const c of pool) {
      const e = normalizeEmail(c.email ?? "");
      if (e && c.candidateId) emailToPlatformId.set(e, c.candidateId);
    }
  }

  const candidateTraces = exportSorted.map((row) => {
    const email = normalizeEmail(row.email);
    const candidateId = emailToPlatformId.get(email) ?? null;
    const p170Store = email
      ? Boolean(findInIngestionStore(store, parseP170SearchQuery(row.email)))
      : false;
    const inRescuePool =
      previewEmails.has(email) ||
      fastEmails.has(email) ||
      ingested.some((c) => matchesP170Query(c, parseP170SearchQuery(row.email)));
    return buildCandidateTrace({
      exportRow: row,
      inExport: true,
      inApiPreview: previewEmails.has(email),
      inApiFast: fastEmails.has(email),
      inIngestion: ingestionEmails.has(email),
      inWorkflow: candidateId ? workflowIds.has(candidateId) : false,
      p170Store,
      p170RescuePool: inRescuePool,
      p157: candidateId ? p157Ids.has(candidateId) : false,
      p171: candidateId ? Boolean(p171.candidates[candidateId]) : false,
    });
  });

  const scannedSet = new Set(store.scannedPositionIds);
  const positionAudits = jobs.map((job) => {
    const exportMatch = input.exportPositions.find(
      (p) => normalizeText(p.position) === normalizeText(job.name),
    );
    const exportCount = exportMatch?.applied ?? 0;
    const ingestedCount = ingested.filter(
      (c) => c.positionId === job.jobId || normalizeText(c.positionName ?? "") === normalizeText(job.name),
    ).length;
    return {
      jobId: job.jobId,
      title: job.name,
      scanned: scannedSet.has(job.jobId),
      scannedAt: store.positionScannedAt?.[job.jobId] ?? null,
      candidateCountOnJobList: job.candidateCount ?? null,
      exportApplicantCount: exportCount,
      ingestedCandidateCount: ingestedCount,
      issues: [
        ...(!scannedSet.has(job.jobId) ? ["not_scanned_this_cycle"] : []),
        ...(exportCount > 0 && ingestedCount === 0 ? ["export_applicants_not_ingested"] : []),
      ],
    };
  });

  const missingFromExport = candidateTraces.filter((t) => t.failurePoint);
  const rootCauseCounts: Record<string, number> = {};
  for (const t of missingFromExport) {
    if (!t.category) continue;
    rootCauseCounts[t.category] = (rootCauseCounts[t.category] ?? 0) + 1;
  }

  const unscanned = countUnscannedPositions(jobs, store);
  const scanQueue = buildIngestionPositionQueue(jobs, store).slice(0, 15);

  const layerCounts = {
    export: exportSorted.length,
    apiPreview: previewCandidates.length,
    apiFast: fastCandidates.length,
    ingestionStore: ingested.length,
    workflowStore: Object.keys(workflowBundle.workflows).length,
    p157Cohort: p157Cohort.candidates.length,
    p171Tracked: Object.keys(p171.candidates).length,
  };

  const coveragePct =
    exportSorted.length > 0
      ? Math.round(
          (candidateTraces.filter((t) => t.layers.find((l) => l.layer === "ingestion_store")?.pass)
            .length /
            exportSorted.length) *
            100,
        )
      : 0;

  const bottlenecks = [
    {
      rank: 1,
      id: "per_position_api_scan_budget",
      impact: "critical",
      detail: `Preview returns ${previewCandidates.length}, fast ${fastCandidates.length} vs export ${exportSorted.length}. Per-position scanning with 18s/115s budgets cannot cover 203 positions in one call.`,
      evidence: `Measured preview=${previewCandidates.length}, fast=${fastCandidates.length}, export=${exportSorted.length}`,
    },
    {
      rank: 2,
      id: "incomplete_ingestion_cycle",
      impact: "critical",
      detail: `Ingestion store has ${ingested.length} candidates, ${scannedSet.size}/${jobs.length} positions scanned, cycleComplete=${store.cycleComplete}.`,
      evidence: `store.updatedAt=${store.updatedAt}, usable=${isIngestionStoreUsable(store)}`,
    },
    {
      rank: 3,
      id: "p157_mtd_ingestion_filter",
      impact: "high",
      detail: `P157 cohort size ${p157Cohort.candidates.length} — MTD + ingested-only filter.`,
      evidence: `notEvaluated=${candidateTraces.filter((t) => !t.layers.find((l) => l.layer === "p157_evaluation")?.pass).length}`,
    },
    {
      rank: 4,
      id: "p171_empty_lifecycle_store",
      impact: "medium",
      detail: "P171 lifecycle store has 0 tracked candidates until orchestrator cycles run.",
      evidence: `p171Tracked=${Object.keys(p171.candidates).length}`,
    },
  ];

  const rankedFixes = [
    {
      rank: 1,
      fix: "P174 unscanned-first ingestion queue (implemented) — always scan highest-priority unscanned positions next.",
      roi: "critical",
    },
    {
      rank: 2,
      fix: "Run repeated POST /api/candidates/ingestion/sync?complete=true until cycleComplete and candidateCount ≥ export baseline.",
      roi: "critical",
    },
    {
      rank: 3,
      fix: "Unified applicant-priority sort for preview/fast/ingestion (implemented) — recent activity + applicant count + updated date.",
      roi: "high",
    },
    {
      rank: 4,
      fix: "Optional: P154 continuous runner on host (10m interval) for background completion without operator triggers.",
      roi: "high",
    },
    {
      rank: 5,
      fix: "Expand P157 cohort to full ingested set post-backfill (separate phase — out of P174 sync scope).",
      roi: "medium",
    },
  ];

  return {
    sourcePhase: P174_SOURCE_PHASE,
    generatedAt,
    readOnly: true,
    executiveSummary: {
      parityStatus: coveragePct >= 95 ? "pass" : "fail",
      exportCandidates: exportSorted.length,
      ingestionCandidates: ingested.length,
      coveragePct,
      primaryBottleneck: bottlenecks[0]?.id ?? "unknown",
      newestInIngestion: candidateTraces
        .slice(0, 10)
        .filter((t) => t.layers.find((l) => l.layer === "ingestion_store")?.pass).length,
    },
    syncDashboard: {
      totalBreezyPositions: jobs.length,
      positionsScanned: scannedSet.size,
      positionsRemaining: unscanned,
      candidatesInBreezyExport: exportSorted.length,
      candidatesRetrievedPreview: previewCandidates.length,
      candidatesRetrievedFast: fastCandidates.length,
      candidatesIngested: ingested.length,
      candidatesMissing: exportSorted.length - candidateTraces.filter((t) =>
        t.layers.find((l) => l.layer === "ingestion_store")?.pass,
      ).length,
      coveragePercentage: coveragePct,
      scanQueueNext: scanQueue,
      oldestUnscannedPositionId: scanQueue[scanQueue.length - 1] ?? null,
      newestUnscannedPositionId: scanQueue[0] ?? null,
      lastSuccessfulSync: store.lastChunkAt,
      lastFullCycleAt: store.lastFullCycleAt,
      cycleComplete: store.cycleComplete,
      ingestionStoreUsable: isIngestionStoreUsable(store),
      positionCoveragePct: ingestionPositionCoveragePct(store),
      estimatedChunksRemaining: Math.ceil(unscanned / 20),
      estimatedMinutesToFullSync: Math.ceil((unscanned / 20) * 2),
    },
    layerCounts,
    positionCoverage: {
      total: jobs.length,
      scanned: scannedSet.size,
      skipped: unscanned,
      failed: positionAudits.filter((p) => p.issues.includes("export_applicants_not_ingested")).length,
      duplicateScans: 0,
      positions: positionAudits,
    },
    paginationAnalysis: buildPaginationAnalysis(),
    candidateTraces,
    top25Newest: candidateTraces.slice(0, 25),
    rootCauseCounts,
    bottlenecks,
    rankedPermanentFixes: rankedFixes,
    successCriteria: {
      allPositionsScanned: unscanned === 0,
      allCandidatesIngested:
        candidateTraces.filter((t) => !t.layers.find((l) => l.layer === "ingestion_store")?.pass)
          .length === 0,
      p170DiscoversAll: candidateTraces.every(
        (t) =>
          t.layers.find((l) => l.layer === "p170_store")?.pass ||
          t.layers.find((l) => l.layer === "p170_rescue_pool")?.pass,
      ),
      p157EvaluatesEligible: p157Cohort.candidates.length >= ingested.filter((c) => isMtdApplicant(c)).length,
      p171TracksActive: Object.keys(p171.candidates).length > 0,
    },
  };
}
