import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { normalizeTerritoryStateList } from "@/lib/dm-portal/territory-filter-service";
import type { PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import {
  isRecruiterNameInScope,
} from "@/lib/recruiter-operating-system/permissions";
import type { RecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/types";
import type { CommandCenterWorkQueueItem } from "@/lib/unified-recruiting-command-center/types";

function allowedStates(scope: RecruiterOperatingSystemScope): Set<string> | null {
  if (scope.territoryStates.length === 0) return null;
  return normalizeTerritoryStateList(scope.territoryStates);
}

export function filterAlertsForRecruiterScope(
  alerts: ExecutiveAlert[],
  scope: RecruiterOperatingSystemScope,
): ExecutiveAlert[] {
  const states = allowedStates(scope);
  return alerts.filter((alert) => {
    if (scope.scopedToRecruiter) {
      const linked = alert.context?.linkedCandidates ?? [];
      if (linked.some((candidate) => isRecruiterNameInScope(candidate.assignedRecruiter, scope))) {
        return true;
      }
    }
    if (!states) return !scope.scopedToRecruiter;
    const state = alert.context?.state;
    return state ? states.has(normalizeStateCode(state)) : false;
  });
}

export function filterFollowUpsForRecruiterScope(
  followUps: ExecutiveAlertFollowUp[],
  scope: RecruiterOperatingSystemScope,
): ExecutiveAlertFollowUp[] {
  if (!scope.scopedToRecruiter) return followUps;
  return followUps.filter(
    (followUp) =>
      followUp.ownerKind === "recruiter" && isRecruiterNameInScope(followUp.ownerName, scope),
  );
}

export function filterRecommendationsForRecruiterScope(
  recommendations: AutopilotRecommendation[],
  scope: RecruiterOperatingSystemScope,
): AutopilotRecommendation[] {
  if (!scope.scopedToRecruiter) {
    return recommendations.filter(
      (rec) => rec.entityType === "recruiter" || rec.kind === "create-candidate-outreach-campaign",
    );
  }
  return recommendations.filter((rec) => {
    if (rec.entityType === "recruiter" && isRecruiterNameInScope(rec.entityLabel, scope)) {
      return true;
    }
    if (rec.kind === "create-candidate-outreach-campaign") return true;
    if (rec.kind === "reopen-previous-candidates") return true;
    if (rec.kind === "increase-follow-up-frequency") return true;
    if (rec.kind === "escalate-to-dm") return true;
    return false;
  });
}

export function filterDailyActionsForRecruiterScope(
  actions: DailyActionPlanItem[],
  scope: RecruiterOperatingSystemScope,
): DailyActionPlanItem[] {
  if (!scope.scopedToRecruiter) {
    return actions.filter((action) => action.ownerKind === "recruiter");
  }
  return actions.filter(
    (action) =>
      action.ownerKind === "recruiter" && isRecruiterNameInScope(action.owner, scope),
  );
}

export function filterRiskRowsForRecruiterScope(
  rows: PredictiveTerritoryRiskRow[],
  scope: RecruiterOperatingSystemScope,
): PredictiveTerritoryRiskRow[] {
  const states = allowedStates(scope);
  if (!states) return rows;
  return rows.filter((row) => row.states.some((state) => states.has(normalizeStateCode(state))));
}

export function filterWorkQueueForRecruiterScope(
  items: CommandCenterWorkQueueItem[],
  scope: RecruiterOperatingSystemScope,
): CommandCenterWorkQueueItem[] {
  if (!scope.scopedToRecruiter) {
    return items.filter((item) => item.owner.toLowerCase() !== "operations");
  }
  return items.filter((item) => {
    if (isRecruiterNameInScope(item.owner, scope)) return true;
    const stateToken = item.subtitle.match(/\b[A-Z]{2}\b/)?.[0];
    if (stateToken && allowedStates(scope)?.has(normalizeStateCode(stateToken))) {
      return item.type === "follow-up" || item.type === "daily-action";
    }
    return false;
  });
}
