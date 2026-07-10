import {
  fetchBreezyJobs,
  resolveBreezyCompany,
  scanBreezyPublishedPositionsBatch,
  sortPublishedJobsForApplicantPriority,
} from "@/lib/breezy-api";
import {
  buildIngestionPositionQueue,
  countUnscannedPositions,
  selectNextIngestionScanChunk,
} from "@/lib/candidate-ingestion/build-ingestion-scan-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
import { reconcileAllWorkflowsFromOnboarding } from "@/lib/workflow-onboarding-reconciliation";
import { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion/build-capture-metrics";
import {
  listIngestedCandidates,
  mergeIngestedCandidates,
  readIngestionStore,
  startIngestionRun,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { completeJuneQuestionnaireEnrichment } from "@/lib/candidate-ingestion/enrich-candidate-questionnaires";
import { recordPositionScans } from "@/lib/candidate-ingestion/fresh-candidate-ingestion-rescue";
import { runCandidateAutomationEngine } from "@/lib/candidate-automation-engine";
import {
  loadP87FeatureFlags,
  refreshHiringDecisionPreview,
} from "@/lib/autonomous-hiring-decision-engine";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import type { CandidateIngestionSyncResult } from "@/lib/candidate-ingestion/types";

const DEFAULT_CHUNK_SIZE = 20;
const DEFAULT_MAX_RUNTIME_MS = 110_000;

export async function runCandidateIngestionSync(input?: {
  maxPositionsPerChunk?: number;
  maxRuntimeMs?: number;
  byUserId?: string;
  runPipeline?: boolean;
  enrichQuestionnaires?: boolean;
  referenceBreezyMtd?: number;
  completeCycle?: boolean;
  collectChunkTelemetry?: boolean;
}): Promise<CandidateIngestionSyncResult> {
  const maxPositionsPerChunk = input?.maxPositionsPerChunk ?? DEFAULT_CHUNK_SIZE;
  const maxRuntimeMs = input?.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;
  const runPipeline = input?.runPipeline !== false;
  const enrichQuestionnaires = input?.enrichQuestionnaires !== false;
  const deadline = Date.now() + maxRuntimeMs;

  let store = await readIngestionStore();
  store = startIngestionRun(store);

  const company = await resolveBreezyCompany();
  if (!company.ok) {
    return {
      ok: false,
      error: company.error,
      chunksProcessed: 0,
      positionsScannedThisRun: 0,
      newCandidates: 0,
      totalCandidates: Object.keys(store.candidates).length,
      publishedPositions: store.publishedPositionsTotal,
      scannedPositions: new Set(store.scannedPositionIds).size,
      positionCoveragePct: 0,
      cycleComplete: store.cycleComplete,
      checkpointIndex: store.checkpointIndex,
      workflowsCreated: 0,
      workflowsBackfilled: 0,
      workflowsReconciled: 0,
      assigned: 0,
      actionsGenerated: 0,
      progressionsGenerated: 0,
      captureHealth: buildApplicantCaptureHealth({
        store,
        workflows: {},
        jobsByPositionId: new Map(),
        referenceBreezyMtd: input?.referenceBreezyMtd,
      }),
    };
  }

  const jobsResult = await fetchBreezyJobs("published");
  if (!jobsResult.ok) {
    return {
      ok: false,
      error: jobsResult.error,
      chunksProcessed: 0,
      positionsScannedThisRun: 0,
      newCandidates: 0,
      totalCandidates: Object.keys(store.candidates).length,
      publishedPositions: store.publishedPositionsTotal,
      scannedPositions: new Set(store.scannedPositionIds).size,
      positionCoveragePct: 0,
      cycleComplete: false,
      checkpointIndex: store.checkpointIndex,
      workflowsCreated: 0,
      workflowsBackfilled: 0,
      workflowsReconciled: 0,
      assigned: 0,
      actionsGenerated: 0,
      progressionsGenerated: 0,
      captureHealth: buildApplicantCaptureHealth({
        store,
        workflows: {},
        jobsByPositionId: new Map(),
        referenceBreezyMtd: input?.referenceBreezyMtd,
      }),
    };
  }

  const jobs = jobsResult.jobs;
  const jobsById = new Map(jobs.map((j) => [j.jobId, j]));
  const jobsByPositionId = jobsById;
  const sorted = sortPublishedJobsForApplicantPriority(jobs);
  store = {
    ...store,
    publishedPositionIds: buildIngestionPositionQueue(sorted, store),
    publishedPositionsTotal: sorted.length,
    lastJobListAt: new Date().toISOString(),
  };

  let chunksProcessed = 0;
  let positionsScannedThisRun = 0;
  let newCandidates = 0;
  const chunkRecords: import("@/lib/candidate-ingestion/types").CandidateIngestionChunkRecord[] =
    [];

  while (Date.now() < deadline) {
    const unscannedRemaining = countUnscannedPositions(jobs, store);
    if (unscannedRemaining === 0) {
      store = {
        ...store,
        cycleComplete: true,
        lastFullCycleAt: new Date().toISOString(),
        checkpointIndex: store.publishedPositionsTotal,
      };
      break;
    }

    if (!input?.completeCycle && chunksProcessed > 0 && store.cycleComplete) break;

    const positions = selectNextIngestionScanChunk({
      jobs,
      store,
      chunkSize: maxPositionsPerChunk,
    });
    if (positions.length === 0) break;

    const chunkStarted = Date.now();
    const remainingMs = Math.max(5_000, deadline - Date.now());
    const batch = await scanBreezyPublishedPositionsBatch({
      companyId: company.companyId,
      positions,
      filterToDateRange: false,
      maxRuntimeMs: remainingMs,
    });

    const merged = mergeIngestedCandidates(store, batch.candidates);
    store = merged.store;
    newCandidates += merged.newCount;
    positionsScannedThisRun += batch.positionsScanned;

    const scannedSet = new Set(store.scannedPositionIds);
    const newlyScannedIds: string[] = [];
    for (const position of positions.slice(0, batch.positionsScanned)) {
      scannedSet.add(position.jobId);
      newlyScannedIds.push(position.jobId);
    }
    const nextCheckpoint = scannedSet.size;
    const cycleComplete = countUnscannedPositions(jobs, {
      scannedPositionIds: [...scannedSet],
    }) === 0;
    store = recordPositionScans(
      {
        ...store,
        publishedPositionIds: buildIngestionPositionQueue(jobs, {
          scannedPositionIds: [...scannedSet],
        }),
        scannedPositionIds: [...scannedSet],
        checkpointIndex: nextCheckpoint,
        lastChunkAt: new Date().toISOString(),
        chunksThisRun: store.chunksThisRun + 1,
        cycleComplete,
        ...(cycleComplete ? { lastFullCycleAt: new Date().toISOString() } : {}),
      },
      newlyScannedIds,
    );
    chunksProcessed += 1;

    if (input?.collectChunkTelemetry) {
      chunkRecords.push({
        chunkNumber: chunksProcessed,
        positionsQueued: positions.length,
        positionsScanned: batch.positionsScanned,
        positionsSkipped: batch.positionsSkipped,
        candidatesRetrieved: batch.candidates.length,
        candidatesNew: merged.newCount,
        elapsedMs: Date.now() - chunkStarted,
        truncated: batch.truncated,
        positionFetchFailed: batch.positionFetchFailed,
        positionScanTimedOut: batch.positionScanTimedOut,
        positionPaginationIncomplete: batch.positionPaginationIncomplete,
        sanitizeRejected: batch.sanitizeRejected,
        warnings: batch.warnings,
        positionIdsScanned: newlyScannedIds,
      });
    }

    if (batch.truncated && batch.positionsScanned < positions.length) {
      break;
    }

    if (input?.completeCycle && !store.cycleComplete) {
      continue;
    }
    if (!input?.completeCycle) break;
  }

  if (enrichQuestionnaires && Date.now() < deadline) {
    const enrichment = await completeJuneQuestionnaireEnrichment({
      store,
      companyId: company.companyId,
      deadlineMs: deadline,
      onCheckpoint: async (checkpointStore) => {
        await writeIngestionStore(checkpointStore);
      },
    });
    store = enrichment.store;
  }

  await writeIngestionStore(store);

  const bundle = await getCandidateWorkflowBundle();
  const workflows = { ...bundle.workflows };
  const backfill = await backfillWorkflowRecordsForCandidates({
    candidates: listIngestedCandidates(store),
    workflows,
    byUserId: input?.byUserId,
  });

  const reconciliation = await reconcileAllWorkflowsFromOnboarding({
    byUserId: input?.byUserId,
    workflows,
  });

  let assigned = 0;
  let actionsGenerated = 0;
  let progressionsGenerated = 0;

  if (runPipeline) {
    const automation = await runCandidateAutomationEngine({
      trigger: "ingestion",
      byUserId: input?.byUserId,
    });
    assigned = automation.p62Assigned;
    actionsGenerated = automation.p63ActionsGenerated;
    progressionsGenerated = automation.p64ProgressionsGenerated;
  }

  const scannedPositions = new Set(store.scannedPositionIds).size;
  const positionCoveragePct =
    store.publishedPositionsTotal > 0
      ? Math.round((scannedPositions / store.publishedPositionsTotal) * 100)
      : 0;

  const captureHealth = buildApplicantCaptureHealth({
    store,
    workflows,
    jobsByPositionId,
    rosters: bundle.rosters,
    referenceBreezyMtd: input?.referenceBreezyMtd,
  });

  const p87Flags = await loadP87FeatureFlags();
  if (p87Flags.enabled && p87Flags.refreshOnIngestion) {
    const onboardingRecords = await listAllCandidateOnboardingRecords();
    const mtdRows = filterMtdCandidates(listIngestedCandidates(store)).map((candidate) =>
      buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    );
    await refreshHiringDecisionPreview({
      rows: mtdRows,
      jobsByPositionId,
      onboardingRecords,
      mtdOnly: false,
      persist: true,
    });
  }

  return {
    ok: true,
    chunksProcessed,
    positionsScannedThisRun,
    newCandidates,
    totalCandidates: Object.keys(store.candidates).length,
    publishedPositions: store.publishedPositionsTotal,
    scannedPositions,
    positionCoveragePct,
    cycleComplete: store.cycleComplete,
    checkpointIndex: store.checkpointIndex,
    workflowsCreated: backfill.created,
    workflowsBackfilled: backfill.created,
    workflowsReconciled: reconciliation.reconciled,
    assigned,
    actionsGenerated,
    progressionsGenerated,
    captureHealth,
    ...(input?.collectChunkTelemetry ? { chunkRecords } : {}),
  };
}
