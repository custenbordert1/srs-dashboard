import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AuthSession } from "@/lib/auth/types";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import {
  buildCandidateIntelligenceSnapshot,
  type CandidateIntelligenceSnapshot,
} from "@/lib/candidate-intelligence-engine";
import { buildExecutiveInsightsKpis, type ExecutiveInsightsKpis } from "@/lib/executive-insights-engine";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";
import { buildRecruitingAlerts, type RecruitingAlert } from "@/lib/recruiting-alert-engine";
import {
  buildRecruitingRecommendations,
  type RecruitingRecommendation,
} from "@/lib/recruiting-recommendation-engine";
import { AUTOMATION_HOOKS } from "@/lib/recruiting-automation/automation-hooks";
import { buildDailyExecutiveSnapshot, type DailyExecutiveSnapshot } from "@/lib/recruiting-automation/daily-executive-snapshot";
import {
  buildRecruiterProductivityLive,
  type RecruiterProductivityLiveRow,
} from "@/lib/recruiting-automation/recruiter-productivity-live";
import { buildRecruitingTrendCharts, type RecruitingTrendCharts } from "@/lib/recruiting-automation/recruiting-trends";
import {
  buildSmartTerritoryAlerts,
  type SmartTerritoryAlert,
} from "@/lib/recruiting-automation/smart-territory-alerts";
import {
  buildSuggestedActions,
  type SuggestedAction,
} from "@/lib/recruiting-automation/suggested-actions";
import {
  rankCandidatesByJob,
  rankTopCandidatesTerritory,
  type JobCandidateRanking,
  type RankedCandidateRow,
} from "@/lib/recruiting-automation/territory-candidate-ranking";

export type RecruitingIntelligenceSnapshot = {
  territoryLabel: string;
  territoryStates: string[];
  fetchedAt: string;
  jobRankings: JobCandidateRanking[];
  topCandidatesTerritory: RankedCandidateRow[];
  suggestedActions: SuggestedAction[];
  smartAlerts: SmartTerritoryAlert[];
  recruitingAlerts: RecruitingAlert[];
  recommendations: RecruitingRecommendation[];
  candidateIntelligence: CandidateIntelligenceSnapshot;
  executiveInsights: ExecutiveInsightsKpis;
  productivity: RecruiterProductivityLiveRow[];
  trends: RecruitingTrendCharts;
  dailySnapshot: DailyExecutiveSnapshot;
  automationHooks: typeof AUTOMATION_HOOKS;
};

export function buildRecruitingIntelligence(
  session: AuthSession,
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
  workflows: CandidateWorkflowState = {},
): RecruitingIntelligenceSnapshot {
  const territoryStates =
    session.role === "dm" ? session.territoryStates : getAssignedStatesForDm(session.dmName ?? session.name);
  const territoryLabel =
    territoryStates.length > 0 ? territoryStates.join(", ") : "Nationwide";

  return {
    territoryLabel,
    territoryStates,
    fetchedAt,
    jobRankings: rankCandidatesByJob(jobs, candidates, fetchedAt),
    topCandidatesTerritory: rankTopCandidatesTerritory(candidates, 15),
    suggestedActions: buildSuggestedActions(jobs, candidates, fetchedAt),
    smartAlerts: buildSmartTerritoryAlerts(jobs, candidates, fetchedAt, workflows),
    recruitingAlerts: buildRecruitingAlerts(jobs, candidates, fetchedAt, workflows),
    recommendations: buildRecruitingRecommendations(jobs, candidates, fetchedAt),
    candidateIntelligence: buildCandidateIntelligenceSnapshot(candidates, fetchedAt, {
      territoryStates: territoryStates.length > 0 ? territoryStates : undefined,
      workflows,
    }),
    executiveInsights: buildExecutiveInsightsKpis(jobs, candidates, fetchedAt, workflows),
    productivity: buildRecruiterProductivityLive(candidates, workflows, fetchedAt),
    trends: buildRecruitingTrendCharts(jobs, candidates, fetchedAt),
    dailySnapshot: buildDailyExecutiveSnapshot(jobs, candidates, fetchedAt),
    automationHooks: AUTOMATION_HOOKS,
  };
}
