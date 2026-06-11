import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { CommandCenterSnapshot } from "@/lib/recruiting-command-center";
import { buildCommandCenterDmInsights } from "@/lib/command-center-dm-insights";
import { buildCoverageOptimizationSnapshot } from "@/lib/coverage-optimization";
import {
  buildGeneratedNotifications,
} from "@/lib/notification-engine/build-notifications";
import { buildDailyExecutiveSnapshot } from "@/lib/recruiting-automation/daily-executive-snapshot";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import { buildDailyExecutiveBriefing } from "@/lib/ai-recruiting-command-center/executive-briefing-generator";
import { buildTerritoryAiAdvisor } from "@/lib/ai-recruiting-command-center/territory-ai-advisor";
import { buildRecruiterAiCoach } from "@/lib/ai-recruiting-command-center/recruiter-ai-coach";
import {
  buildOpportunityRiskPredictions,
  topOpportunityRisks,
} from "@/lib/ai-recruiting-command-center/opportunity-risk-prediction";
import {
  buildAiInsightsFeed,
  pickSuggestedQuestions,
  SUGGESTED_EXECUTIVE_QUESTIONS,
} from "@/lib/ai-recruiting-command-center/insights-feed";
import type { AiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center/types";

export type AiCommandCenterContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  coverage: CoverageRiskSnapshot | null;
  fetchedAt: string;
  territoryStates?: string[] | null;
  commandCenter: CommandCenterSnapshot;
};

export function buildAiCommandCenterSnapshot(ctx: AiCommandCenterContext): AiCommandCenterSnapshot {
  const dmInsights = buildCommandCenterDmInsights({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
    commandCenter: ctx.commandCenter,
  });

  const territoryCenter = buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  });

  const coverageOptimization = buildCoverageOptimizationSnapshot({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    opportunities: ctx.opportunities,
    activeReps: ctx.activeReps,
    coverage: ctx.coverage,
    fetchedAt: ctx.fetchedAt,
    territoryStates: ctx.territoryStates,
  });

  const generatedNotifications = buildGeneratedNotifications({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    workflows: ctx.workflows,
    coverage: ctx.coverage,
    territoryStates: ctx.territoryStates,
  });
  const criticalNotifications = generatedNotifications
    .filter((row) => row.severity === "critical" && row.status === "active")
    .slice(0, 8);
  const dailyExecutive = buildDailyExecutiveSnapshot(ctx.jobs, ctx.candidates, ctx.fetchedAt);

  const briefing = buildDailyExecutiveBriefing({
    fetchedAt: ctx.fetchedAt,
    commandCenter: ctx.commandCenter,
    dmInsights,
    dailyExecutive,
    criticalNotifications,
    coverageOptimization,
  });

  const territoryAdvisor = buildTerritoryAiAdvisor({ dmInsights, territoryCenter });
  const recruiterCoach = buildRecruiterAiCoach({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    workflows: ctx.workflows,
    fetchedAt: ctx.fetchedAt,
    territoryStates: ctx.territoryStates,
  });

  const opportunityRisks = topOpportunityRisks(buildOpportunityRiskPredictions(coverageOptimization));

  const insightsFeed = buildAiInsightsFeed({
    briefing,
    dmInsights,
    territoryAdvisor,
    recruiterCoach,
    opportunityRisks,
    criticalNotifications,
  });

  const snapshot: AiCommandCenterSnapshot = {
    fetchedAt: ctx.fetchedAt,
    briefing,
    insightsFeed,
    territoryAdvisor,
    recruiterCoach,
    opportunityRisks,
    suggestedQuestions: [...SUGGESTED_EXECUTIVE_QUESTIONS],
  };

  snapshot.suggestedQuestions = pickSuggestedQuestions(snapshot);
  return snapshot;
}
