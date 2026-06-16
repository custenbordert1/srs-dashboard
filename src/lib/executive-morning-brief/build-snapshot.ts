import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import { buildAutomationOpportunitiesSection } from "@/lib/executive-morning-brief/build-automation-section";
import { buildMorningBriefCoverageForecast } from "@/lib/executive-morning-brief/build-coverage-forecast-section";
import { buildEmailDigestDraft, buildExecutiveNarratives } from "@/lib/executive-morning-brief/build-narrative";
import { buildMorningBriefPriorities } from "@/lib/executive-morning-brief/build-priorities";
import { buildRecommendationIntelligenceSection } from "@/lib/executive-morning-brief/build-recommendation-section";
import { buildRecruiterPerformanceSummary } from "@/lib/executive-morning-brief/build-recruiter-summary";
import { buildExecutiveScorecard, buildRecruitingHealthSummary } from "@/lib/executive-morning-brief/build-scorecard";
import { buildTerritoryRiskSummary } from "@/lib/executive-morning-brief/build-territory-summary";
import { buildCeoHomeSnapshot } from "@/lib/executive-morning-brief/build-ceo-home";
import type { CeoHomeSnapshot, ExecutiveMorningBriefSnapshot } from "@/lib/executive-morning-brief/types";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export type BuildExecutiveMorningBriefInput = {
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  referenceMs?: number;
  deferExpensive?: boolean;
  emailRecipients?: string[];
  persistRecommendations?: boolean;
};

function emptyCeoHome(): CeoHomeSnapshot {
  return {
    narrative: "Serving cached intelligence — executive home refreshes in background.",
    onTrack: "yellow",
    recruitingHealth: { score: 0, light: "yellow" as const, label: "at-risk" as const },
    coverage: { score: 0, light: "yellow", trendLabel: "—" },
    hiringForecast: { summary: "Forecast loading…", light: "yellow", horizon14Coverage: null },
    criticalTerritories: [],
    topPriorities: [],
    topRisks: [],
    topOpportunities: [],
    automationQueue: { pendingApprovals: 0, draftCount: 0, summary: "No automations queued", light: "green" },
    recommendedActions: [],
    roiSummary: {
      bestActionWorking: null,
      worstAction: null,
      estimatedHiresInfluenced: 0,
      coverageGained: 0,
      automationRoi: {
        completedCount: 0,
        successRate: 0,
        summary: "Automation ROI tracking begins after completed executions",
      },
    },
  };
}

function emptyMorningBriefSnapshot(fetchedAt: string): ExecutiveMorningBriefSnapshot {
  const planDate = fetchedAt.slice(0, 10);
  const emptyNarratives = {
    today: "Serving cached intelligence — full morning brief refreshes in background.",
    thisWeek: "Weekly outlook will populate after intelligence cache refresh.",
    outlook30Day: "30-day outlook pending full snapshot build.",
  };
  const base = {
    generatedAt: fetchedAt,
    planDate,
    scorecard: [],
    recruitingHealth: { score: 0, tier: "at-risk" as const, summary: "Partial snapshot — refresh in progress." },
    dailyPriorities: [],
    territoryRisks: [],
    recruiterPerformance: { rows: [], topPerformers: [], needsAttention: [] },
    coverageForecast: [],
    automationOpportunities: {
      jobRefreshDrafts: 0,
      postingDrafts: 0,
      followUpCampaigns: 0,
      pendingApprovals: 0,
      highestImpact: [],
    },
    recommendationIntelligence: {
      topPerforming: [],
      worstPerforming: [],
      overallSuccessRate: 0,
      roiHighlights: [],
      roiSummary: emptyCeoHome().roiSummary,
      trustByType: {},
    },
    executiveRecommendations: [],
    narratives: emptyNarratives,
    emailDigest: {
      subject: `SRS Executive Morning Brief — ${planDate}`,
      generatedAt: fetchedAt,
      recipients: [],
      sections: {
        executiveSummary: emptyNarratives.today,
        topRisks: [],
        topOpportunities: [],
        forecast: "",
        recommendedActions: [],
      },
      bodyText: emptyNarratives.today,
    },
  };
  return { ...base, ceoHome: emptyCeoHome() };
}

export async function buildExecutiveMorningBriefSnapshot(
  input: BuildExecutiveMorningBriefInput,
): Promise<ExecutiveMorningBriefSnapshot> {
  const { bundle } = input;
  if (input.deferExpensive) {
    return emptyMorningBriefSnapshot(bundle.fetchedAt);
  }

  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const alerts = buildAlertSnapshot({ bundle }).alerts;
  const autopilot = buildRecruitingAutopilotSnapshot({ bundle, alerts, followUps });

  const scorecard = buildExecutiveScorecard(bundle);
  const recruitingHealth = buildRecruitingHealthSummary(bundle);
  const dailyPriorities = buildMorningBriefPriorities({ bundle, alerts });
  const territoryRisks = buildTerritoryRiskSummary({ bundle, alerts, followUps });
  const recruiterPerformance = buildRecruiterPerformanceSummary(bundle);
  const coverageForecast = buildMorningBriefCoverageForecast({ bundle, alerts, followUps });
  const automationOpportunities = await buildAutomationOpportunitiesSection();
  const recommendationIntelligence = await buildRecommendationIntelligenceSection(
    bundle,
    input.persistRecommendations !== false,
  );

  const executiveRecommendations = autopilot.highestImpact.slice(0, 8).map((rec) => ({
    id: rec.id,
    title: rec.title,
    impactScore: rec.impactScore,
    confidenceScore: rec.confidenceScore,
    category: rec.kind,
  }));

  const partial: ExecutiveMorningBriefSnapshot = {
    generatedAt: bundle.fetchedAt,
    planDate: new Date(referenceMs).toISOString().slice(0, 10),
    scorecard,
    recruitingHealth,
    dailyPriorities,
    territoryRisks,
    recruiterPerformance,
    coverageForecast,
    automationOpportunities,
    recommendationIntelligence,
    executiveRecommendations,
    narratives: { today: "", thisWeek: "", outlook30Day: "" },
    emailDigest: {
      subject: "",
      generatedAt: bundle.fetchedAt,
      recipients: [],
      sections: {
        executiveSummary: "",
        topRisks: [],
        topOpportunities: [],
        forecast: "",
        recommendedActions: [],
      },
      bodyText: "",
    },
    ceoHome: emptyCeoHome(),
  };

  partial.narratives = buildExecutiveNarratives(partial);
  partial.emailDigest = buildEmailDigestDraft(partial, input.emailRecipients);
  partial.ceoHome = buildCeoHomeSnapshot(partial);

  return partial;
}
