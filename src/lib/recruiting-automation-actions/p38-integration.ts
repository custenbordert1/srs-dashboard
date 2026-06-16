import type { AuthSession } from "@/lib/auth/types";
import { extractOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";
import {
  appendRecommendationAuditNote,
  executeRecommendationRecord,
  markRecommendationApproved,
  markRecommendationExecuted,
} from "@/lib/recommendation-intelligence/store";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";

function recommendationScope(automation: RecruitingAutomationRecord) {
  const recommendationId = automation.sourceRecommendation?.recommendationId;
  return {
    recommendationId,
    scope: {
      territory: automation.territory,
      recruiter: automation.actionType === "follow-up-campaign" ? automation.owner : null,
      project: null,
      dmName: automation.dmName,
      entityId: recommendationId ?? null,
      entityType: automation.actionType,
    },
    ownerKind: automation.dmName ? ("dm" as const) : ("operations" as const),
  };
}

export async function onAutomationApproved(
  session: AuthSession,
  automation: RecruitingAutomationRecord,
): Promise<void> {
  const { recommendationId, ownerKind } = recommendationScope(automation);
  if (!recommendationId) return;

  await markRecommendationApproved(session, {
    recommendationId,
    owner: automation.owner,
    ownerKind,
  });
  await appendRecommendationAuditNote(
    session,
    recommendationId,
    `Automation ${automation.id} approved for execution`,
  );
}

export async function onAutomationExecutionStarted(
  session: AuthSession,
  automation: RecruitingAutomationRecord,
  bundle?: RecruitingIntelligenceRouteBundle,
): Promise<void> {
  const { recommendationId, scope, ownerKind } = recommendationScope(automation);
  if (!recommendationId) return;

  const baselineMetrics = bundle ? extractOutcomeMetrics(bundle, scope) : null;

  await executeRecommendationRecord(session, {
    recommendationId,
    owner: automation.owner,
    ownerKind,
    baselineMetrics,
  });
  await appendRecommendationAuditNote(
    session,
    recommendationId,
    `Automation ${automation.id} execution started (simulated)`,
  );
}

export async function onAutomationCompleted(
  session: AuthSession,
  automation: RecruitingAutomationRecord,
  bundle?: RecruitingIntelligenceRouteBundle,
): Promise<void> {
  const { recommendationId, scope, ownerKind } = recommendationScope(automation);
  if (!recommendationId) return;

  const baselineMetrics = bundle ? extractOutcomeMetrics(bundle, scope) : null;

  await executeRecommendationRecord(session, {
    recommendationId,
    owner: automation.owner,
    ownerKind,
    baselineMetrics,
  });
  await markRecommendationExecuted(recommendationId);
  await appendRecommendationAuditNote(
    session,
    recommendationId,
    `Automation ${automation.id} completed — ROI tracking active`,
  );
}
