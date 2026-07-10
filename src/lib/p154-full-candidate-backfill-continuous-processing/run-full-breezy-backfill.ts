import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  fetchBreezyCandidates,
  fetchBreezyJobs,
  resolveBreezyCompany,
  scanBreezyPositionsBatch,
} from "@/lib/breezy-api";
import { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
import {
  listIngestedCandidates,
  mergeIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { reconcileAllWorkflowsFromOnboarding } from "@/lib/workflow-onboarding-reconciliation";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type {
  P1544BackfillReport,
  P1544JobPipelineState,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";
import {
  P1544_BACKFILL_CHUNK_RUNTIME_MS,
  P1544_CLOSED_ARCHIVED_BACKFILL_BUDGET_MS,
  P1544_POSITION_CHUNK_SIZE,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";

function parseAppliedDate(candidate: BreezyCandidate): number {
  const raw = candidate.addedDate || candidate.appliedDate;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSinceJune(candidate: BreezyCandidate, sinceIso: string): boolean {
  const sinceMs = Date.parse(`${sinceIso}T00:00:00.000Z`);
  const appliedMs = parseAppliedDate(candidate);
  if (appliedMs > 0) return appliedMs >= sinceMs;
  return true;
}

function sortJobsForBackfill(jobs: BreezyJob[]): BreezyJob[] {
  return [...jobs]
    .filter((job) => job.jobId)
    .sort((a, b) => {
      const tb = Date.parse(b.updatedDate ?? "") || 0;
      const ta = Date.parse(a.updatedDate ?? "") || 0;
      return tb - ta;
    });
}

async function scanJobStatePositions(input: {
  companyId: string;
  pipelineState: P1544JobPipelineState;
  positions: BreezyJob[];
  backfillSince: string;
  backfillThrough: string;
  totalBudgetMs?: number;
}): Promise<{
  candidates: BreezyCandidate[];
  positionsScanned: number;
  truncated: boolean;
  warnings: string[];
}> {
  const candidates: BreezyCandidate[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  let positionsScanned = 0;
  let truncated = false;
  const deadlineMs = Date.now() + (input.totalBudgetMs ?? P1544_CLOSED_ARCHIVED_BACKFILL_BUDGET_MS);

  for (let offset = 0; offset < input.positions.length; offset += P1544_POSITION_CHUNK_SIZE) {
    if (Date.now() >= deadlineMs) {
      truncated = true;
      warnings.push(`${input.pipelineState} backfill truncated at position ${offset}.`);
      break;
    }
    const chunk = input.positions.slice(offset, offset + P1544_POSITION_CHUNK_SIZE);
    const batch = await scanBreezyPositionsBatch({
      companyId: input.companyId,
      positions: chunk,
      pipelineState: input.pipelineState,
      dateRangeStart: input.backfillSince,
      dateRangeEnd: input.backfillThrough,
      filterToDateRange: true,
      maxRuntimeMs: Math.min(
        P1544_BACKFILL_CHUNK_RUNTIME_MS,
        Math.max(5_000, deadlineMs - Date.now()),
      ),
    });
    positionsScanned += batch.positionsScanned;
    truncated = truncated || batch.truncated;
    warnings.push(...batch.warnings);
    for (const candidate of batch.candidates) {
      if (!candidate.candidateId || seen.has(candidate.candidateId)) continue;
      seen.add(candidate.candidateId);
      candidates.push(candidate);
    }
  }

  return { candidates, positionsScanned, truncated, warnings };
}

async function fetchPublishedCandidatesSinceJune(
  backfillSince: string,
): Promise<{ candidates: BreezyCandidate[]; positionsScanned: number; truncated: boolean; warnings: string[] }> {
  const result = await fetchBreezyCandidates({
    scanMode: "all",
    state: "published",
    force: true,
  });
  if (!result.ok) {
    return {
      candidates: [],
      positionsScanned: 0,
      truncated: true,
      warnings: [result.error],
    };
  }
  return {
    candidates: result.candidates.filter((c) => isSinceJune(c, backfillSince)),
    positionsScanned: result.positionsScanned ?? 0,
    truncated: Boolean(result.truncated),
    warnings: result.warnings ?? [],
  };
}

export async function runFullBreezyCandidateBackfill(input?: {
  backfillSince?: string;
  backfillThrough?: string;
  includeClosed?: boolean;
  includeArchived?: boolean;
  byUserId?: string;
}): Promise<P1544BackfillReport> {
  const started = Date.now();
  const backfillSince = input?.backfillSince ?? "2026-06-01";
  const backfillThrough = input?.backfillThrough ?? new Date().toISOString().slice(0, 10);
  const includeClosed = input?.includeClosed ?? true;
  const includeArchived = input?.includeArchived ?? true;
  const warnings: string[] = [];

  const company = await resolveBreezyCompany();
  if (!company.ok) {
    throw new Error(company.error);
  }

  const storeBefore = await readIngestionStore();
  const existingIds = new Set(Object.keys(storeBefore.candidates));

  const publishedJobs = await fetchBreezyJobs("published");
  if (!publishedJobs.ok) throw new Error(publishedJobs.error);

  const closedJobs = includeClosed ? await fetchBreezyJobs("closed") : null;
  const archivedJobs = includeArchived ? await fetchBreezyJobs("archived") : null;

  const closedPositions =
    closedJobs?.ok === true ? sortJobsForBackfill(closedJobs.jobs) : [];
  const archivedPositions =
    archivedJobs?.ok === true ? sortJobsForBackfill(archivedJobs.jobs) : [];

  if (closedJobs && !closedJobs.ok) warnings.push(`Closed jobs unavailable: ${closedJobs.error}`);
  if (archivedJobs && !archivedJobs.ok) {
    warnings.push(`Archived jobs unavailable: ${archivedJobs.error}`);
  }

  const publishedScan = await fetchPublishedCandidatesSinceJune(backfillSince);
  warnings.push(...publishedScan.warnings);

  let closedScan = { candidates: [] as BreezyCandidate[], positionsScanned: 0, truncated: false, warnings: [] as string[] };
  if (closedPositions.length > 0) {
    closedScan = await scanJobStatePositions({
      companyId: company.companyId,
      pipelineState: "closed",
      positions: closedPositions,
      backfillSince,
      backfillThrough,
      totalBudgetMs: P1544_CLOSED_ARCHIVED_BACKFILL_BUDGET_MS,
    });
    warnings.push(...closedScan.warnings);
  }

  let archivedScan = { candidates: [] as BreezyCandidate[], positionsScanned: 0, truncated: false, warnings: [] as string[] };
  if (archivedPositions.length > 0) {
    archivedScan = await scanJobStatePositions({
      companyId: company.companyId,
      pipelineState: "archived",
      positions: archivedPositions,
      backfillSince,
      backfillThrough,
      totalBudgetMs: P1544_CLOSED_ARCHIVED_BACKFILL_BUDGET_MS,
    });
    warnings.push(...archivedScan.warnings);
  }

  const mergedById = new Map<string, BreezyCandidate>();
  for (const candidate of [
    ...publishedScan.candidates,
    ...closedScan.candidates,
    ...archivedScan.candidates,
  ]) {
    if (!candidate.candidateId) continue;
    mergedById.set(candidate.candidateId, candidate);
  }

  const allCandidates = [...mergedById.values()];
  const sinceJune = allCandidates.filter((c) => isSinceJune(c, backfillSince));
  const alreadyInStore = sinceJune.filter((c) => existingIds.has(c.candidateId));
  const newlyDiscovered = sinceJune.filter((c) => !existingIds.has(c.candidateId));

  let store = storeBefore;
  const mergeResult = mergeIngestedCandidates(store, sinceJune);
  store = mergeResult.store;
  store.lastChunkAt = new Date().toISOString();
  await writeIngestionStore(store);

  const workflowState = await getCandidateWorkflowState();
  const backfill = await backfillWorkflowRecordsForCandidates({
    candidates: sinceJune,
    workflows: { ...workflowState },
    byUserId: input?.byUserId,
  });
  const reconciled = await reconcileAllWorkflowsFromOnboarding({
    byUserId: input?.byUserId,
  });

  const totalInStore = listIngestedCandidates(store).length;

  return {
    backfillSince,
    backfillThrough,
    totalPositionsScanned:
      publishedScan.positionsScanned + closedScan.positionsScanned + archivedScan.positionsScanned,
    activePositionsScanned: publishedScan.positionsScanned,
    closedPositionsScanned: closedScan.positionsScanned,
    archivedPositionsScanned: archivedScan.positionsScanned,
    totalCandidatesFound: allCandidates.length,
    candidatesSinceJune: sinceJune.length,
    candidatesAlreadyInStore: alreadyInStore.length,
    newlyDiscoveredCandidates: newlyDiscovered.length,
    candidatesMissingBeforeBackfill: newlyDiscovered.length,
    mergedIntoStore: totalInStore,
    workflowsCreated: backfill.created,
    workflowsReconciled: reconciled.reconciled,
    truncated:
      publishedScan.truncated || closedScan.truncated || archivedScan.truncated,
    warnings,
    executionTimeMs: Date.now() - started,
  };
}
