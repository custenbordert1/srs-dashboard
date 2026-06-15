import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import {
  buildConversionByDm,
  buildConversionByProject,
  buildConversionByRecruiter,
  buildConversionByState,
} from "@/lib/placement-command-center/build-conversion-analytics";
import { buildDmCoverageScorecard } from "@/lib/placement-command-center/build-dm-coverage-scorecard";
import { buildExecutivePlacementBoard } from "@/lib/placement-command-center/build-executive-placement-board";
import { buildOpenCallRecoveryActions } from "@/lib/placement-command-center/build-open-call-recovery";
import { buildPlacementFunnel } from "@/lib/placement-command-center/build-placement-funnel";
import { buildProjectFillForecasts } from "@/lib/placement-command-center/build-project-fill-forecast";
import { buildRecruiterPlacementScorecard } from "@/lib/placement-command-center/build-recruiter-placement-scorecard";
import { buildStoreCoverageRows } from "@/lib/placement-command-center/build-store-coverage";
import type { PlacementCommandCenterSnapshot } from "@/lib/placement-command-center/types";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isHiredStage } from "@/lib/dm-dashboard/territory-shared";

export type PlacementCommandCenterBuildContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  fetchedAt: string;
  coverage: CoverageRiskSnapshot;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
};

export function buildPlacementCommandCenterSnapshot(
  ctx: PlacementCommandCenterBuildContext,
): PlacementCommandCenterSnapshot {
  const funnel = buildPlacementFunnel({
    candidates: ctx.candidates,
    workflows: ctx.workflows,
    fetchedAt: ctx.fetchedAt,
  });
  const storeCoverage = buildStoreCoverageRows({
    opportunities: ctx.opportunities,
    coverage: ctx.coverage,
    candidates: ctx.candidates,
    workflows: ctx.workflows,
  });
  const projectForecasts = buildProjectFillForecasts({
    coverage: ctx.coverage,
    opportunities: ctx.opportunities,
    fetchedAt: ctx.fetchedAt,
  });
  const openCallRecovery = buildOpenCallRecoveryActions({
    opportunities: ctx.opportunities,
    coverage: ctx.coverage,
    candidates: ctx.candidates,
    workflows: ctx.workflows,
    fetchedAt: ctx.fetchedAt,
  });

  const recruiterScorecard = buildRecruiterPlacementScorecard({
    candidates: ctx.candidates,
    workflows: ctx.workflows,
    fetchedAt: ctx.fetchedAt,
  });
  const dmScorecard = buildDmCoverageScorecard({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    opportunities: ctx.opportunities,
    coverage: ctx.coverage,
    activeReps: ctx.activeReps,
    fetchedAt: ctx.fetchedAt,
  });

  const executiveBoard = buildExecutivePlacementBoard({
    storeCoverage,
    projectForecasts,
    opportunities: ctx.opportunities,
    coverage: ctx.coverage,
  });

  const placements30d = ctx.candidates.filter((candidate) => {
    const row = buildBaselineWorkflowRow(candidate, ctx.workflows?.[candidate.candidateId]);
    return row.workflowStatus === "Active Rep" || isHiredStage(candidate.stage);
  }).length;

  return {
    fetchedAt: ctx.fetchedAt,
    funnel,
    storeCoverage,
    projectForecasts,
    conversionByRecruiter: buildConversionByRecruiter({
      candidates: ctx.candidates,
      workflows: ctx.workflows,
    }),
    conversionByDm: buildConversionByDm({
      candidates: ctx.candidates,
      workflows: ctx.workflows,
    }),
    conversionByProject: buildConversionByProject({
      candidates: ctx.candidates,
      workflows: ctx.workflows,
    }),
    conversionByState: buildConversionByState({
      candidates: ctx.candidates,
      workflows: ctx.workflows,
    }),
    recruiterScorecard,
    dmScorecard,
    openCallRecovery,
    executiveBoard,
    summary: {
      totalOpenCalls: ctx.opportunities.filter((row) => row.openStatus && !row.isStaffed).length,
      avgCoveragePercent: ctx.coverage.executiveSummary.averageCoverageScore,
      placements30d,
      criticalProjects: projectForecasts.filter((row) => row.outcome === "critical").length,
    },
  };
}
