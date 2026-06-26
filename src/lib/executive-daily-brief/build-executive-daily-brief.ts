import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildAutonomousOnboardingDashboardSnapshot } from "@/lib/autonomous-onboarding-engine/build-autonomous-onboarding-dashboard";
import { buildAutonomousPaperworkDashboard } from "@/lib/autonomous-paperwork-engine/build-autonomous-paperwork-dashboard";
import { canExecutePaperwork } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import { countBuckets } from "@/lib/dm-dashboard/territory-shared";
import {
  formatExecutiveDailyBriefText,
  resolveDailyBriefGreeting,
} from "@/lib/executive-daily-brief/format-executive-daily-brief";
import type {
  ExecutiveDailyBriefMarketNeed,
  ExecutiveDailyBriefSnapshot,
} from "@/lib/executive-daily-brief/types";
import { P72_PREVIEW_MODE, P72_SOURCE_PHASE } from "@/lib/executive-daily-brief/types";
import {
  countApplicantsToday,
  countApplicantsYesterday,
  formatRefreshLabel,
} from "@/lib/executive-natural-language-queries/query-date-windows";
import { buildMarketCapacityPlans, buildWorkforcePlanningMetrics } from "@/lib/workforce-placement-intelligence/build-market-capacity-plan";
import { buildMarketIntelligenceSnapshot } from "@/lib/workforce-placement-intelligence/build-market-intelligence";
import { buildHumanReviewQueue } from "@/lib/workforce-placement-intelligence/build-human-review-queue";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

function executionModeLabel(mode: string, enabled: boolean): string {
  if (!enabled) return "Off";
  return mode.charAt(0).toUpperCase() + mode.slice(1) + " Mode";
}

export function buildExecutiveDailyBrief(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
}): ExecutiveDailyBriefSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const applicantsToday = countApplicantsToday(input.candidates, fetchedAt);
  const applicantsYesterday = countApplicantsYesterday(input.candidates, fetchedAt);

  const paperworkDashboard = buildAutonomousPaperworkDashboard({
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    fetchedAt,
  });

  const onboardingDashboard = buildAutonomousOnboardingDashboardSnapshot({
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    fetchedAt,
  });

  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );
  const humanReviewCandidates = input.workflowRows.filter((row) => row.questionnaireIntelligence != null);
  const humanReviewQueue = buildHumanReviewQueue({
    candidates: humanReviewCandidates,
    onboardingByCandidate,
  });

  let marketsNeedingGrowth: ExecutiveDailyBriefMarketNeed[] = [];
  let recommendedNewReps = 0;
  let marketsNeedingGrowthCount = 0;
  let highestRiskMarket: ExecutiveDailyBriefMarketNeed | null = null;

  if (input.opportunities && input.activeReps) {
    const { recommendedMarkets } = buildMarketIntelligenceSnapshot({
      opportunities: input.opportunities,
      activeReps: input.activeReps,
      referenceMs,
    });
    const capacityPlans = buildMarketCapacityPlans(recommendedMarkets);
    const planning = buildWorkforcePlanningMetrics(capacityPlans);
    recommendedNewReps = planning.totalRecommendedNewReps;
    marketsNeedingGrowthCount = planning.marketsNeedingHires;
    marketsNeedingGrowth = capacityPlans
      .filter((row) => row.recommendedNewReps > 0)
      .slice(0, 5)
      .map((row) => ({
        marketLabel: row.marketLabel,
        recommendedNewReps: row.recommendedNewReps,
      }));
    highestRiskMarket = marketsNeedingGrowth[0] ?? null;
  }

  const sourceBuckets = countBuckets(
    input.candidates.map((c) => ({ label: c.source.trim() || "Unknown" })),
    (row) => row.label,
    1,
  );
  const topSource = sourceBuckets[0] ?? null;

  const liveSendsEnabled = canExecutePaperwork(input.flags);
  const automation = {
    automationEnabled: input.flags.automationEnabled,
    executionMode: input.flags.executionMode,
    liveSendsEnabled,
    statusLabel: executionModeLabel(input.flags.executionMode, input.flags.automationEnabled),
  };

  const metrics = {
    applicantsToday,
    applicantsYesterday,
    applicantsDelta: applicantsToday - applicantsYesterday,
    paperworkSentToday: paperworkDashboard.todayActivity.paperworkSentToday,
    paperworkSignedToday: paperworkDashboard.todayActivity.signedToday,
    pendingSignatures: paperworkDashboard.todayActivity.pendingSignature,
    waitingOver48Hours: paperworkDashboard.executiveMetrics.pendingOver48Hours,
    readyForWorkToday: onboardingDashboard.progressMetrics.readyForWorkToday,
    humanReviewCount: humanReviewQueue.length,
    marketsNeedingGrowth: marketsNeedingGrowthCount,
    recommendedNewReps,
    failedPackets: paperworkDashboard.todayActivity.failed,
    topRecruitingSource: topSource?.label ?? null,
    topRecruitingSourceCount: topSource?.value ?? 0,
  };

  const risks = [
    {
      label: "candidates blocked from automatic paperwork",
      count: paperworkDashboard.automationReadiness.blocked,
    },
    {
      label: "failed packets",
      count: metrics.failedPackets,
    },
    {
      label: "waiting over 48 hours",
      count: metrics.waitingOver48Hours,
    },
  ];

  const greeting = resolveDailyBriefGreeting(referenceMs);
  const lastDataRefresh = formatRefreshLabel(fetchedAt);

  const brief: ExecutiveDailyBriefSnapshot = {
    previewMode: P72_PREVIEW_MODE,
    sourcePhase: P72_SOURCE_PHASE,
    fetchedAt,
    greeting,
    metrics,
    marketsNeedingGrowth,
    highestRiskMarket,
    automation,
    risks,
    summaryText: "",
    lastDataRefresh,
  };

  brief.summaryText = formatExecutiveDailyBriefText(brief);
  return brief;
}
