import { execSync } from "node:child_process";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildStageStats, buildHiringRecommendationGaps } from "@/lib/p188-production-workflow-gap-analysis/analyze";
import {
  buildFlowDiagramMarkdown,
  buildGapRecommendations,
  buildHiringRecommendationCodePath,
} from "@/lib/p188-production-workflow-gap-analysis/codePath";
import {
  P188_SOURCE_PHASE,
  type P188AnalysisReport,
  type P188SafetyWalls,
} from "@/lib/p188-production-workflow-gap-analysis/types";

export function resolveCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export const P188_SAFETY: P188SafetyWalls = {
  productionWrites: 0,
  candidateStateChanges: 0,
  paperworkSends: 0,
  approvals: 0,
  melWrites: 0,
  automationEnabled: false,
  featureFlagsChanged: false,
};

export function runProductionGapAnalysis(
  workflows: CandidateWorkflowRecord[],
  opts?: { nowMs?: number; productionCommit?: string },
): P188AnalysisReport {
  const nowMs = opts?.nowMs ?? Date.now();
  const { stageDistribution, furthestStageCounts, stageStats, classifications } =
    buildStageStats(workflows, nowMs);
  const { hiringRecommendationCount, explanations } = buildHiringRecommendationGaps(
    workflows,
    nowMs,
  );

  const stopPoint =
    hiringRecommendationCount === 0
      ? "Production stops before Hiring Recommendation (Applied backlog + paperwork bypass). Highlight: Recruiter Review → Hiring Recommendation never materializes in durable state."
      : "Hiring Recommendation present for some candidates";

  return {
    sourcePhase: P188_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    productionCommit: opts?.productionCommit ?? resolveCommit(),
    candidatesScanned: workflows.length,
    stageDistribution,
    stageStats,
    furthestStageCounts,
    hiringRecommendationCount,
    zeroHiringRecommendationExplanation: explanations,
    codePath: buildHiringRecommendationCodePath(),
    recommendations: buildGapRecommendations(),
    flowStopPoint: stopPoint,
    safety: { ...P188_SAFETY },
  };
}

export function summarizeClassificationsForArtifact(
  workflows: CandidateWorkflowRecord[],
  nowMs = Date.now(),
) {
  return buildStageStats(workflows, nowMs).classifications;
}

export { buildFlowDiagramMarkdown };
