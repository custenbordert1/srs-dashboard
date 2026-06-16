import { filterRecommendationsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import type { DmEscalationCategory, DmEscalationItem, DmOperatingSystemScope } from "@/lib/dm-operating-system/types";
import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { CommandCenterWorkQueueItem } from "@/lib/unified-recruiting-command-center/types";

const ESCALATION_LIMIT = 15;

function categoryFromRecommendation(kind: AutopilotRecommendation["kind"]): DmEscalationCategory {
  switch (kind) {
    case "increase-ad-spend":
      return "additional-budget";
    case "adjust-pay-rate":
      return "pay-adjustment";
    case "assign-additional-recruiter":
    case "launch-territory-blitz":
      return "territory-assistance";
    case "escalate-to-dm":
      return "executive-attention";
    default:
      return "executive-attention";
  }
}

function categoryFromAlert(alert: ExecutiveAlert): DmEscalationCategory {
  if (alert.recommendedAction.includes("pay")) return "pay-adjustment";
  if (alert.recommendedAction.includes("budget") || alert.recommendedAction.includes("ads")) {
    return "additional-budget";
  }
  if (alert.severity === "critical") return "executive-attention";
  return "territory-assistance";
}

export function buildDmEscalationCenter(input: {
  recommendations: AutopilotRecommendation[];
  alerts: ExecutiveAlert[];
  actionQueue: CommandCenterWorkQueueItem[];
  scope: DmOperatingSystemScope;
}): DmEscalationItem[] {
  const scopedRecs = filterRecommendationsForDmScope(input.recommendations, input.scope);
  const items: DmEscalationItem[] = [];

  for (const rec of scopedRecs) {
    if (
      rec.kind !== "escalate-to-dm" &&
      rec.kind !== "adjust-pay-rate" &&
      rec.kind !== "increase-ad-spend" &&
      rec.kind !== "assign-additional-recruiter" &&
      rec.kind !== "launch-territory-blitz"
    ) {
      continue;
    }
    items.push({
      id: `escalation:rec:${rec.id}`,
      category: categoryFromRecommendation(rec.kind),
      title: rec.title,
      detail: rec.reasoning,
      impactScore: rec.impactScore,
      recommendedAction: rec.title,
      territory: rec.dmName ?? rec.entityLabel,
    });
  }

  for (const alert of input.alerts) {
    if (alert.severity !== "critical" && alert.severity !== "high") continue;
    if (
      alert.recommendedAction !== "notify-dm" &&
      alert.recommendedAction !== "territory-escalation" &&
      !alert.title.toLowerCase().includes("escalat")
    ) {
      continue;
    }
    items.push({
      id: `escalation:alert:${alert.id}`,
      category: categoryFromAlert(alert),
      title: alert.title,
      detail: alert.description,
      impactScore: alert.impactScore,
      recommendedAction: alert.recommendedAction,
      territory: alert.context?.dmName,
      state: alert.context?.state,
    });
  }

  for (const queueItem of input.actionQueue) {
    if (queueItem.priority !== "critical") continue;
    items.push({
      id: `escalation:queue:${queueItem.id}`,
      category: "executive-attention",
      title: queueItem.title,
      detail: queueItem.subtitle,
      impactScore: queueItem.impactScore,
      recommendedAction: queueItem.impactLabel,
      territory: queueItem.territory,
    });
  }

  const deduped = new Map<string, DmEscalationItem>();
  for (const item of items) {
    if (!deduped.has(item.id)) deduped.set(item.id, item);
  }

  return [...deduped.values()]
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, ESCALATION_LIMIT);
}
