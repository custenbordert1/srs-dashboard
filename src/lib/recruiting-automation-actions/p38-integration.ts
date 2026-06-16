import type { AuthSession } from "@/lib/auth/types";
import { extractOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";
import {
  executeRecommendationRecord,
  markRecommendationExecuted,
} from "@/lib/recommendation-intelligence/store";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";

export async function onAutomationCompleted(
  session: AuthSession,
  automation: RecruitingAutomationRecord,
  bundle?: RecruitingIntelligenceRouteBundle,
): Promise<void> {
  const recommendationId = automation.sourceRecommendation?.recommendationId;
  if (!recommendationId) return;

  const scope = {
    territory: automation.territory,
    recruiter: automation.actionType === "follow-up-campaign" ? automation.owner : null,
    project: null,
    dmName: automation.dmName,
    entityId: recommendationId,
    entityType: automation.actionType,
  };

  const baselineMetrics = bundle ? extractOutcomeMetrics(bundle, scope) : null;

  await executeRecommendationRecord(session, {
    recommendationId,
    owner: automation.owner,
    ownerKind: automation.dmName ? "dm" : "operations",
    baselineMetrics,
  });
  await markRecommendationExecuted(recommendationId);
}
