import type { CommandCenterDmInsightsSnapshot } from "@/lib/command-center-dm-insights";
import type { NotificationRecord } from "@/lib/notification-engine";
import type {
  AiCommandCenterSnapshot,
  AiInsight,
  AiInsightSeverity,
  ExecutiveBriefing,
  OpportunityRiskPrediction,
  RecruiterAiCoachSnapshot,
  TerritoryAiAdvisorEntry,
} from "@/lib/ai-recruiting-command-center/types";

const SEVERITY_RANK: Record<AiInsightSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function insight(input: Omit<AiInsight, "score"> & { score?: number }): AiInsight {
  return { score: 50, ...input };
}

export function buildAiInsightsFeed(input: {
  briefing: ExecutiveBriefing;
  dmInsights: CommandCenterDmInsightsSnapshot;
  territoryAdvisor: TerritoryAiAdvisorEntry[];
  recruiterCoach: RecruiterAiCoachSnapshot;
  opportunityRisks: OpportunityRiskPrediction[];
  criticalNotifications: NotificationRecord[];
}): AiInsight[] {
  const rows: AiInsight[] = [];

  for (const alert of input.criticalNotifications.slice(0, 6)) {
    rows.push(
      insight({
        id: `notif:${alert.id}`,
        category: "action",
        severity: alert.severity === "critical" ? "critical" : "high",
        title: alert.title,
        explanation: alert.message,
        action: "Review in Notification Center",
        source: "notifications",
        score: alert.severity === "critical" ? 95 : 80,
        entityId: alert.id,
      }),
    );
  }

  for (const risk of input.opportunityRisks.slice(0, 8)) {
    rows.push(
      insight({
        id: `opp-risk:${risk.opportunityId}`,
        category: "prediction",
        severity: risk.overallRiskScore >= 75 ? "critical" : risk.overallRiskScore >= 55 ? "high" : "medium",
        title: `${risk.projectName} at risk`,
        explanation: risk.explanation,
        action: "Assign best rep and confirm travel coverage",
        source: "coverage-optimization",
        score: risk.overallRiskScore,
        entityId: risk.opportunityId,
      }),
    );
  }

  for (const territory of input.territoryAdvisor
    .filter((row) => row.attentionScore >= 50)
    .slice(0, 6)) {
    rows.push(
      insight({
        id: `territory:${territory.dmName}`,
        category: "recommendation",
        severity: territory.attentionScore >= 75 ? "critical" : "high",
        title: `${territory.dmName} needs attention`,
        explanation: territory.coverageRiskExplanation,
        action: territory.recommendedActions[0] ?? "Review territory coverage plan",
        source: "territory-intelligence",
        score: territory.attentionScore,
        territory: String(territory.dmName),
      }),
    );
  }

  for (const candidate of input.recruiterCoach.candidatesToContact.slice(0, 5)) {
    rows.push(
      insight({
        id: `coach:contact:${candidate.candidateId}`,
        category: "action",
        severity: "medium",
        title: `Contact ${candidate.name}`,
        explanation: candidate.reason,
        action: "Call or message candidate today",
        source: "recruiter-productivity",
        score: 65,
        entityId: candidate.candidateId,
      }),
    );
  }

  for (const job of input.recruiterCoach.jobsNeedingApplicants.slice(0, 4)) {
    rows.push(
      insight({
        id: `coach:job:${job.jobId}`,
        category: "recommendation",
        severity: "high",
        title: job.title,
        explanation: job.reason,
        action: "Boost sourcing or repost job variant",
        source: "recruiter-productivity",
        score: 72,
        entityId: job.jobId,
      }),
    );
  }

  for (const item of input.briefing.topRisks.items.slice(0, 3)) {
    rows.push(
      insight({
        id: `briefing:risk:${rows.length}`,
        category: "explanation",
        severity: "high",
        title: "Executive risk signal",
        explanation: item,
        action: "Review daily briefing and assign owner",
        source: "executive-briefing",
        score: 78,
      }),
    );
  }

  for (const alert of [
    ...input.dmInsights.riskAlerts.criticalShortages,
    ...input.dmInsights.riskAlerts.belowThreshold,
  ].slice(0, 4)) {
    rows.push(
      insight({
        id: alert.id,
        category: "explanation",
        severity: alert.severity === "critical" ? "critical" : "high",
        title: alert.title,
        explanation: alert.detail,
        action: "Open Coverage Risk or Territory Intelligence tab",
        source: "command-center-dm-insights",
        score: alert.severity === "critical" ? 88 : 70,
        territory: alert.dmName,
      }),
    );
  }

  const deduped = new Map<string, AiInsight>();
  for (const row of rows) {
    if (!deduped.has(row.id)) deduped.set(row.id, row);
  }

  return [...deduped.values()].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.score - a.score;
  });
}

export const SUGGESTED_EXECUTIVE_QUESTIONS = [
  "Which territories need attention?",
  "Why are hires down this week?",
  "Which recruiter is overloaded?",
  "What projects are at risk?",
] as const;

export function pickSuggestedQuestions(_snapshot: AiCommandCenterSnapshot): string[] {
  return [...SUGGESTED_EXECUTIVE_QUESTIONS];
}
