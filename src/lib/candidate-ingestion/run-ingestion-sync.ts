import {
  fetchBreezyJobs,
  resolveBreezyCompany,
  scanBreezyPublishedPositionsBatch,
  sortPublishedJobsByRecentUpdated,
} from "@/lib/breezy-api";
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
const JOB_LIST_STALE_MS = 60 * 60 * 1000;

export async function runCandidateIngestionSync(input?: {
  maxPositionsPerChunk?: number;
  maxRuntimeMs?: number;
  byUserId?: string;
  runPipeline?: boolean;
  enrichQuestionnaires?: boolean;
  referenceBreezyMtd?: number;
  completeCycle?: boolean;
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

  const jobsStale =
    !store.lastJobListAt ||
    Date.now() - Date.parse(store.lastJobListAt) > JOB_LIST_STALE_MS ||
    store.publishedPositionIds.length === 0;

  if (jobsStale) {
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
    const sorted = sortPublishedJobsByRecentUpdated(jobsResult.jobs);
    store = {
      ...store,
      publishedPositionIds: sorted.map((j) => j.jobId),
      publishedPositionsTotal: sorted.length,
      lastJobListAt: new Date().toISOString(),
    };
  }

  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsById = new Map(jobs.map((j) => [j.jobId, j]));
  const jobsByPositionId = jobsById;

  let chunksProcessed = 0;
  let positionsScannedThisRun = 0;
  let newCandidates = 0;

  while (Date.now() < deadline) {
    if (store.checkpointIndex >= store.publishedPositionsTotal) {
      store = {
        ...store,
        cycleComplete: true,
        lastFullCycleAt: new Date().toISOString(),
        checkpointIndex: store.publishedPositionsTotal,
      };
      break;
    }

    if (!input?.completeCycle && chunksProcessed > 0 && store.cycleComplete) break;

    const chunkIds = store.publishedPositionIds.slice(
      store.checkpointIndex,
      store.checkpointIndex + maxPositionsPerChunk,
    );
    if (chunkIds.length === 0) break;

    const positions = chunkIds
      .map((id) => jobsById.get(id))
      .filter((job): job is NonNullable<typeof job> => Boolean(job));

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
    const nextCheckpoint = store.checkpointIndex + batch.positionsScanned;
    store = recordPositionScans(
      {
        ...store,
        scannedPositionIds: [...scannedSet],
        checkpointIndex: nextCheckpoint,
        lastChunkAt: new Date().toISOString(),
        chunksThisRun: store.chunksThisRun + 1,
        cycleComplete: nextCheckpoint >= store.publishedPositionsTotal,
      },
      newlyScannedIds,
    );
    chunksProcessed += 1;

    if (batch.truncated && batch.positionsScanned < positions.length) {
      break;
    }

    if (input?.completeCycle && store.checkpointIndex < store.publishedPositionsTotal) {
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
  };
}
