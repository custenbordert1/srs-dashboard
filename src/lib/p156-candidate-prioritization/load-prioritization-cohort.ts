import { buildCoverageNeeds } from "@/lib/autonomous-recruiting-engine/build-coverage-needs";
import type { TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { resolveCandidatesForExport } from "@/lib/candidate-ingestion/resolve-candidates-for-export";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { P156_SERVER_BREEZY_TIMEOUT_MS } from "@/lib/p156-candidate-prioritization/constants";
import { withServerTimeout } from "@/lib/p155-autopilot-operations-dashboard/request-timeout";

export type P156PrioritizationCohort = {
  fetchedAt: string;
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  coverageNeeds: TerritoryCoverageNeed[];
  opportunities: MelOpportunity[];
  jobsByPositionId: Map<string, BreezyJob>;
  warnings: string[];
};

function resolveTerritoryNeed(
  row: BreezyCandidate,
  coverageNeeds: TerritoryCoverageNeed[],
): TerritoryCoverageNeed | null {
  const state = normalizeStateCode(row.state ?? "");
  const dm = getDmForState(state) ?? "Unassigned";
  return (
    coverageNeeds.find((entry) => entry.dmName === dm || entry.states.includes(state)) ?? null
  );
}

function resolveDaysUntilProjectStart(
  row: BreezyCandidate,
  opportunities: MelOpportunity[],
): number | null {
  const state = normalizeStateCode(row.state ?? "");
  const dm = getDmForState(state) ?? "Unassigned";
  const relevant = opportunities.filter(
    (opp) =>
      opp.openStatus &&
      (normalizeStateCode(opp.state) === state || opp.territoryOwner === dm),
  );
  if (relevant.length === 0) return null;

  const priorityDays: Record<MelOpportunity["priority"], number> = {
    high: 5,
    medium: 12,
    low: 28,
  };
  const minDays = Math.min(...relevant.map((opp) => priorityDays[opp.priority]));
  return minDays;
}

function resolveContinuityProject(
  row: BreezyCandidate,
  opportunities: MelOpportunity[],
): boolean {
  const state = normalizeStateCode(row.state ?? "");
  return opportunities.some(
    (opp) =>
      opp.openStatus &&
      normalizeStateCode(opp.state) === state &&
      /continuity|ongoing|permanent/i.test(opp.projectType),
  );
}

function resolveNearestProjectName(
  row: BreezyCandidate,
  opportunities: MelOpportunity[],
): string | null {
  const state = normalizeStateCode(row.state ?? "");
  const match =
    opportunities.find(
      (opp) => opp.openStatus && normalizeStateCode(opp.state) === state && opp.priority === "high",
    ) ??
    opportunities.find((opp) => opp.openStatus && normalizeStateCode(opp.state) === state);
  return match?.projectName ?? null;
}

export async function loadPrioritizationCohort(input?: {
  includeAllCandidates?: boolean;
}): Promise<P156PrioritizationCohort> {
  const warnings: string[] = [];
  const fetchedAt = new Date().toISOString();

  const [store, bundle, jobsResult, onboardingRecords, melResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    withServerTimeout({
      label: "P156 Breezy jobs",
      promise: fetchBreezyJobs("published"),
      timeoutMs: P156_SERVER_BREEZY_TIMEOUT_MS,
      fallback: {
        ok: false as const,
        error: "P156 Breezy jobs timeout",
        fetchedAt: new Date().toISOString(),
      },
    }),
    listCandidateOnboardingRecords(500),
    fetchMelProjectsSheet(),
  ]);

  if (!jobsResult.value.ok) {
    warnings.push(
      jobsResult.timedOut
        ? "Breezy jobs fetch timed out — scoring without live campaign data"
        : "Breezy jobs unavailable — using ingestion-only campaign signals",
    );
  }

  const candidatePool = input?.includeAllCandidates
    ? await resolveCandidatesForExport()
    : listIngestedCandidates(store);
  const mtd = filterMtdCandidates(candidatePool);
  const jobs = jobsResult.value.ok ? jobsResult.value.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));

  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  if (!melResult.ok) {
    warnings.push("MEL projects sheet unavailable — project urgency uses territory coverage only");
  }

  const coverageNeeds = buildCoverageNeeds({
    jobs,
    candidates: mtd,
    workflows: bundle.workflows,
    opportunities,
    fetchedAt: melResult.ok ? melResult.fetchedAt : fetchedAt,
  });

  const candidates = mtd.map((entry) =>
    buildScoredWorkflowRow(entry, bundle.workflows[entry.candidateId], {
      job: jobsByPositionId.get(entry.positionId),
    }),
  );

  return {
    fetchedAt,
    candidates,
    onboardingRecords,
    coverageNeeds,
    opportunities,
    jobsByPositionId,
    warnings,
  };
}

export function buildScoringContextForRow(input: {
  row: ScoredCandidateWorkflowRow;
  coverageNeeds: TerritoryCoverageNeed[];
  opportunities: MelOpportunity[];
  jobsByPositionId: Map<string, BreezyJob>;
  referenceMs: number;
}) {
  const need = resolveTerritoryNeed(input.row, input.coverageNeeds);
  const job = input.jobsByPositionId.get(input.row.positionId) ?? null;

  return {
    openDemand: need?.openCalls ?? 0,
    coverageStatus: need?.coverageStatus ?? "Healthy",
    coverageNeedScore: need?.coverageNeedScore ?? 0,
    territoryLabel: need?.territoryLabel ?? input.row.state ?? "Unknown",
    dmName: need?.dmName ?? getDmForState(normalizeStateCode(input.row.state ?? "")) ?? "Unassigned",
    daysUntilProjectStart: resolveDaysUntilProjectStart(input.row, input.opportunities),
    hasActiveCampaign: Boolean(job && job.status === "published"),
    isContinuityProject: resolveContinuityProject(input.row, input.opportunities),
    nearestDistanceMiles: input.row.distanceMiles ?? null,
    referenceMs: input.referenceMs,
    projectName: resolveNearestProjectName(input.row, input.opportunities),
  };
}

export function pickActiveOnboardingRecord(
  records: CandidateOnboardingRecord[],
  candidateId: string,
): CandidateOnboardingRecord | null {
  const forCandidate = records.filter((r) => r.candidateId === candidateId);
  const active = forCandidate.find(
    (record) =>
      record.status !== "failed" &&
      record.status !== "declined" &&
      record.status !== "expired",
  );
  return active ?? forCandidate[0] ?? null;
}
