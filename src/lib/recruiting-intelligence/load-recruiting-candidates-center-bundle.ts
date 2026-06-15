import { filterStatesForSession } from "@/lib/auth/permissions";
import type { AuthSession } from "@/lib/auth/types";
import {
  filterRostersForSession,
  filterWorkflowsForSession,
} from "@/lib/auth/workflow-territory-filter";
import type { BreezyCandidatesSuccess, BreezyJobsResult } from "@/lib/breezy-api";
import { isPartialBreezyPositionSync } from "@/lib/breezy-api";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowState, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { filterOpportunitiesByTerritory } from "@/lib/mel-matching/mel-opportunity-parser";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  loadRecruitingIntelligenceRouteBundle,
  type RecruitingIntelligenceRouteFailure,
} from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

export const CANDIDATES_CENTER_HYDRATION_NOTE =
  "Full position-by-position hydration is not included in the recruiting intelligence snapshot (fast scan only). When partialSync is true, the Candidates tab may continue background hydration via /api/breezy/candidates.";

export type RecruitingCandidatesCenterMeta = {
  partialSync: boolean;
  scanMode: string | null;
  positionsScanned: number;
  totalPositionsAvailable: number;
  melOk: boolean;
  refreshedAt: string;
  intelligenceCache: RecruitingIntelligenceCacheMeta;
  hydrationViaDirectBreezy: boolean;
  hydrationNote: string;
};

export type RecruitingCandidatesCenterPayload = {
  candidatesResult: BreezyCandidatesSuccess;
  jobsResult: Extract<BreezyJobsResult, { ok: true }>;
  workflows: CandidateWorkflowState;
  rosters: RecruiterRosters;
  opportunities: MelOpportunity[];
  workflowUpdatedAt: string;
  meta: RecruitingCandidatesCenterMeta;
};

export async function loadRecruitingCandidatesCenterBundle(
  session: AuthSession,
  options: { forceRefresh?: boolean } = {},
): Promise<
  | { ok: true; center: RecruitingCandidatesCenterPayload }
  | { ok: false; failure: RecruitingIntelligenceRouteFailure }
> {
  const territoryStates = filterStatesForSession(session) ?? undefined;

  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh: options.forceRefresh,
    territoryStates,
    scopeRepsToTerritory: false,
  });

  if (!loaded.ok) {
    return loaded;
  }

  const { bundle } = loaded;
  const workflowBundle = await getCandidateWorkflowBundle();

  const workflows = filterWorkflowsForSession(session, bundle.workflows, bundle.candidates);
  const rosters = filterRostersForSession(session, workflowBundle.rosters);

  const opportunities =
    territoryStates && territoryStates.length > 0
      ? filterOpportunitiesByTerritory(bundle.opportunities, territoryStates)
      : bundle.opportunities;

  const partialSync =
    isPartialBreezyPositionSync(bundle.candidatesResult) ||
    Boolean(bundle.candidatesResult.partial);

  const candidatesResult: BreezyCandidatesSuccess = {
    ...bundle.candidatesResult,
    candidates: bundle.candidates,
    hydrationComplete: !partialSync,
    partial: partialSync,
    source: "recruiting-intelligence-cache",
  };

  const jobsResult: Extract<BreezyJobsResult, { ok: true }> = {
    ...bundle.jobsResult,
    jobs: bundle.jobs,
  };

  return {
    ok: true,
    center: {
      candidatesResult,
      jobsResult,
      workflows,
      rosters,
      opportunities,
      workflowUpdatedAt: workflowBundle.updatedAt,
      meta: {
        partialSync,
        scanMode: bundle.candidatesResult.scanMode ?? "fast",
        positionsScanned: bundle.candidatesResult.positionsScanned ?? 0,
        totalPositionsAvailable: bundle.candidatesResult.totalPositionsAvailable ?? 0,
        melOk: bundle.melOk,
        refreshedAt: bundle.fetchedAt,
        intelligenceCache: bundle.intelligenceCache,
        hydrationViaDirectBreezy: partialSync,
        hydrationNote: CANDIDATES_CENTER_HYDRATION_NOTE,
      },
    },
  };
}
