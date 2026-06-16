import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import { AUTOPILOT_RECOMMENDATION_LABELS } from "@/lib/recruiting-autopilot/recommendation-labels";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { extractOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";
import { buildRecommendationRecord } from "@/lib/recommendation-intelligence/store";
import type {
  RecommendationRecord,
  RecommendationScope,
  RecommendationSource,
  RecommendationType,
} from "@/lib/recommendation-intelligence/types";

function scopeFromAutopilot(rec: AutopilotRecommendation): RecommendationScope {
  return {
    territory: rec.entityType === "territory" ? rec.entityLabel : rec.dmName ?? null,
    recruiter: rec.entityType === "recruiter" ? rec.entityLabel : null,
    project: rec.entityType === "project" ? rec.entityLabel : null,
    dmName: rec.dmName ?? (rec.entityType === "dm" ? rec.entityLabel : null),
    entityId: rec.entityId,
    entityType: rec.entityType,
  };
}

function recordFromAutopilot(
  rec: AutopilotRecommendation,
  bundle: RecruitingIntelligenceRouteBundle,
  createdDate: string,
): RecommendationRecord {
  const scope = scopeFromAutopilot(rec);
  const baseline = extractOutcomeMetrics(bundle, scope);
  return buildRecommendationRecord({
    recommendationId: rec.id,
    recommendationType: rec.kind,
    source: "autopilot",
    createdDate,
    owner: rec.dmName ?? null,
    territory: scope.territory,
    recruiter: scope.recruiter,
    project: scope.project,
    dmName: scope.dmName,
    expectedOutcome: `+${rec.opportunity.estimatedCandidateGain} applicants · +${rec.opportunity.estimatedCoverageGain}% coverage`,
    expectedImpactScore: rec.impactScore,
    expectedApplicantGain: rec.opportunity.estimatedCandidateGain,
    scope,
    baselineMetrics: baseline,
  });
}

function recordFromDailyAction(
  item: DailyActionPlanItem,
  bundle: RecruitingIntelligenceRouteBundle,
  createdDate: string,
): RecommendationRecord {
  const scope = scopeFromAutopilot(item.recommendation);
  const baseline = extractOutcomeMetrics(bundle, scope);
  return buildRecommendationRecord({
    recommendationId: item.id,
    recommendationType: item.recommendation.kind,
    source: "daily-action",
    createdDate,
    owner: item.owner,
    territory: scope.territory,
    recruiter: item.ownerKind === "recruiter" ? item.owner : scope.recruiter,
    project: scope.project,
    dmName: item.ownerKind === "dm" ? item.owner : scope.dmName,
    expectedOutcome: `+${item.expectedHireGain} hires · +${item.expectedCoverageGain}% coverage`,
    expectedImpactScore: item.expectedImpact,
    expectedApplicantGain: item.recommendation.opportunity.estimatedCandidateGain,
    scope,
    baselineMetrics: baseline,
  });
}

function alertRecommendationType(alert: ExecutiveAlert): RecommendationType {
  if (alert.recommendedAction === "create-job-ad") return "refresh-job-posting";
  if (alert.recommendedAction === "assign-recruiter") return "assign-additional-recruiter";
  if (alert.recommendedAction === "notify-dm" || alert.recommendedAction === "territory-escalation") {
    return "escalate-to-dm";
  }
  if (alert.recommendedAction === "candidate-followup") return "increase-follow-up-frequency";
  return "alert-action";
}

function recordFromAlert(
  alert: ExecutiveAlert,
  bundle: RecruitingIntelligenceRouteBundle,
  createdDate: string,
): RecommendationRecord {
  const scope: RecommendationScope = {
    territory: alert.context?.state ?? alert.context?.territoryLabel ?? null,
    recruiter: null,
    project: alert.context?.projectName ?? null,
    dmName: alert.context?.dmName ?? null,
    entityId: alert.id,
    entityType: "alert",
  };
  const baseline = extractOutcomeMetrics(bundle, scope);
  const type = alertRecommendationType(alert);
  const label =
    type === "alert-action"
      ? alert.recommendedAction
      : AUTOPILOT_RECOMMENDATION_LABELS[type as keyof typeof AUTOPILOT_RECOMMENDATION_LABELS] ?? type;

  return buildRecommendationRecord({
    recommendationId: `alert:${alert.id}`,
    recommendationType: type,
    source: "alert",
    createdDate: alert.createdAt || createdDate,
    owner: alert.context?.dmName ?? null,
    territory: scope.territory,
    project: scope.project,
    dmName: scope.dmName,
    expectedOutcome: `${label} — ${alert.title}`,
    expectedImpactScore: alert.impactScore,
    expectedApplicantGain: Math.max(3, Math.round((alert.context?.openCalls ?? 2) * 1.5)),
    scope,
    baselineMetrics: baseline,
  });
}

export function syncRecommendationRecords(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  autopilotRecommendations: AutopilotRecommendation[];
  dailyActions?: DailyActionPlanItem[];
  alerts?: ExecutiveAlert[];
  existing: RecommendationRecord[];
}): RecommendationRecord[] {
  const { bundle, existing } = input;
  const createdDate = bundle.fetchedAt;
  const byId = new Map(existing.map((row) => [row.recommendationId, row]));

  const incoming: Array<{ id: string; record: RecommendationRecord; source: RecommendationSource }> = [];

  for (const rec of input.autopilotRecommendations) {
    incoming.push({ id: rec.id, record: recordFromAutopilot(rec, bundle, createdDate), source: "autopilot" });
  }

  for (const item of input.dailyActions ?? []) {
    incoming.push({
      id: item.id,
      record: recordFromDailyAction(item, bundle, createdDate),
      source: "daily-action",
    });
  }

  for (const alert of input.alerts ?? []) {
    const id = `alert:${alert.id}`;
    incoming.push({ id, record: recordFromAlert(alert, bundle, createdDate), source: "alert" });
  }

  const merged = new Map(byId);
  for (const row of incoming) {
    const prior = merged.get(row.id);
    if (!prior) {
      merged.set(row.id, row.record);
      continue;
    }
    merged.set(row.id, {
      ...prior,
      expectedOutcome: row.record.expectedOutcome,
      expectedImpactScore: row.record.expectedImpactScore,
      expectedApplicantGain: row.record.expectedApplicantGain,
      territory: prior.territory ?? row.record.territory,
      recruiter: prior.recruiter ?? row.record.recruiter,
      project: prior.project ?? row.record.project,
      dmName: prior.dmName ?? row.record.dmName,
      scope: prior.scope.entityId ? prior.scope : row.record.scope,
    });
  }

  return [...merged.values()];
}
