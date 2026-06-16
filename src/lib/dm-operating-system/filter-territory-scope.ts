import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { normalizeTerritoryStateList } from "@/lib/dm-portal/territory-filter-service";
import type { DmOperatingSystemScope } from "@/lib/dm-operating-system/types";
import type { PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { CommandCenterWorkQueueItem } from "@/lib/unified-recruiting-command-center/types";
import { isDmNameInScope, isStateInDmScope } from "@/lib/dm-operating-system/permissions";

function allowedStates(scope: DmOperatingSystemScope): Set<string> | null {
  if (!scope.scopedToTerritory || scope.territoryStates.length === 0) return null;
  return normalizeTerritoryStateList(scope.territoryStates);
}

export function filterAlertsForDmScope(
  alerts: ExecutiveAlert[],
  scope: DmOperatingSystemScope,
): ExecutiveAlert[] {
  const states = allowedStates(scope);
  if (!states) return alerts;
  return alerts.filter((alert) => {
    const dm = alert.context?.dmName;
    if (dm && isDmNameInScope(dm, scope)) return true;
    const state = alert.context?.state;
    return state ? states.has(normalizeStateCode(state)) : false;
  });
}

export function filterFollowUpsForDmScope(
  followUps: ExecutiveAlertFollowUp[],
  scope: DmOperatingSystemScope,
): ExecutiveAlertFollowUp[] {
  if (!scope.scopedToTerritory) return followUps;
  return followUps.filter((followUp) => {
    if (followUp.ownerKind === "dm" && isDmNameInScope(followUp.ownerName, scope)) return true;
    if (followUp.ownerKind === "recruiter") return true;
    return false;
  });
}

export function filterRecommendationsForDmScope(
  recommendations: AutopilotRecommendation[],
  scope: DmOperatingSystemScope,
): AutopilotRecommendation[] {
  const states = allowedStates(scope);
  if (!states) return recommendations;
  return recommendations.filter((rec) => {
    if (rec.dmName && isDmNameInScope(rec.dmName, scope)) return true;
    if (rec.entityType === "dm" && isDmNameInScope(rec.entityLabel, scope)) return true;
    const stateMatch = rec.supportingMetrics.find((metric) =>
      metric.label.toLowerCase().includes("state"),
    );
    if (stateMatch && isStateInDmScope(stateMatch.value, scope)) return true;
    return rec.entityType === "territory" && isDmNameInScope(rec.entityLabel, scope);
  });
}

export function filterDailyActionsForDmScope(
  actions: DailyActionPlanItem[],
  scope: DmOperatingSystemScope,
): DailyActionPlanItem[] {
  const states = allowedStates(scope);
  if (!states) return actions;
  return actions.filter((action) => {
    if (action.ownerKind === "dm" && isDmNameInScope(action.owner, scope)) return true;
    if (action.ownerKind === "recruiter") {
      return action.recommendation.dmName
        ? isDmNameInScope(action.recommendation.dmName, scope)
        : true;
    }
    return isDmNameInScope(action.owner, scope);
  });
}

export function filterRiskRowsForDmScope(
  rows: PredictiveTerritoryRiskRow[],
  scope: DmOperatingSystemScope,
): PredictiveTerritoryRiskRow[] {
  const states = allowedStates(scope);
  if (!states) return rows;
  return rows.filter((row) => {
    if (row.entityType === "dm") return isDmNameInScope(row.dmName, scope);
    if (row.states.some((state) => states.has(normalizeStateCode(state)))) return true;
    return row.dmName ? isDmNameInScope(row.dmName, scope) : false;
  });
}

export function filterWorkQueueForDmScope(
  items: CommandCenterWorkQueueItem[],
  scope: DmOperatingSystemScope,
): CommandCenterWorkQueueItem[] {
  const states = allowedStates(scope);
  if (!states) return items;
  return items.filter((item) => {
    if (isDmNameInScope(item.owner, scope)) return true;
    if (isDmNameInScope(item.territory, scope)) return true;
    const stateToken = item.subtitle.match(/\b[A-Z]{2}\b/)?.[0];
    if (stateToken && states.has(normalizeStateCode(stateToken))) return true;
    return false;
  });
}
