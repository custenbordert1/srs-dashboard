import type { ExecutiveDashboardSnapshot } from "@/lib/dm-dashboard";
import type { ExecutiveInsightsKpis } from "@/lib/executive-insights-engine";
import type { ExecutiveAccountabilitySnapshot } from "@/lib/executive-accountability/types";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/client";
import type { RecruitingAlert } from "@/lib/recruiting-alert-engine";

export type ExecutiveSnapshotLine = {
  text: string;
  href?: string;
};

export type ExecutiveSnapshotContent = {
  topRisks: ExecutiveSnapshotLine[];
  topPriorities: ExecutiveSnapshotLine[];
  topOpportunities: ExecutiveSnapshotLine[];
};

function uniqueLines(lines: ExecutiveSnapshotLine[], limit: number): ExecutiveSnapshotLine[] {
  const seen = new Set<string>();
  const result: ExecutiveSnapshotLine[] = [];
  for (const line of lines) {
    if (seen.has(line.text)) continue;
    seen.add(line.text);
    result.push(line);
    if (result.length >= limit) break;
  }
  return result;
}

export function buildExecutiveSnapshotContent(input: {
  insights?: ExecutiveInsightsKpis;
  data?: ExecutiveDashboardSnapshot | null;
  accountability?: ExecutiveAccountabilitySnapshot | null;
  pipeline?: PipelineIntelligenceSnapshot | null;
  alerts?: RecruitingAlert[];
  candidatesUnavailable?: boolean;
}): ExecutiveSnapshotContent {
  const { insights, data, accountability, pipeline, alerts, candidatesUnavailable } = input;

  const risks: ExecutiveSnapshotLine[] = [];
  const priorities: ExecutiveSnapshotLine[] = [];
  const opportunities: ExecutiveSnapshotLine[] = [];

  if (candidatesUnavailable) {
    risks.push({ text: "Candidate cache not ready — pipeline metrics may be incomplete." });
  }

  if (insights && insights.criticalTerritories > 0) {
    risks.push({
      text: `${insights.criticalTerritories} DM territor${insights.criticalTerritories === 1 ? "y" : "ies"} below health threshold`,
    });
  }

  for (const row of data?.worstTerritories.slice(0, 3) ?? []) {
    risks.push({
      text: `${row.dmName} — health ${row.healthScore} (${row.healthLabel})`,
      href: "/?tab=dm-scorecards",
    });
  }

  for (const row of pipeline?.executive.topBottleneckTerritories.slice(0, 2) ?? []) {
    risks.push({
      text: `${row.territoryLabel} — bottleneck at ${row.bottleneck.stage}`,
      href: "/?tab=pipeline-intelligence",
    });
  }

  for (const row of pipeline?.slaTracking.filter((sla) => sla.beyondSlaCount > 0).slice(0, 2) ?? []) {
    risks.push({
      text: `${row.label}: ${row.beyondSlaCount} beyond SLA`,
      href: "/?tab=pipeline-intelligence",
    });
  }

  const narrative = accountability?.weeklyNarrative;
  if (narrative?.topRiskThisWeek) {
    risks.push({ text: narrative.topRiskThisWeek });
  }

  for (const alert of alerts?.filter((a) => a.severity === "critical").slice(0, 2) ?? []) {
    risks.push({ text: alert.title, href: "/?tab=needs-attention" });
  }

  const overdue = accountability?.statusSummary.overdue ?? 0;
  if (overdue > 0) {
    priorities.push({
      text: `${overdue} overdue accountability action${overdue === 1 ? "" : "s"}`,
      href: "/?tab=executive-accountability&view=overdue",
    });
  }

  for (const action of accountability?.overdueActions.slice(0, 3) ?? []) {
    priorities.push({
      text: action.title,
      href: "/?tab=executive-accountability&view=overdue",
    });
  }

  if (narrative?.topActionRequired) {
    priorities.push({
      text: narrative.topActionRequired,
      href: "/?tab=executive-accountability",
    });
  }

  for (const alert of alerts?.filter((a) => a.severity === "warning").slice(0, 2) ?? []) {
    priorities.push({ text: alert.title, href: "/?tab=needs-attention" });
  }

  if ((accountability?.statusSummary.open ?? 0) > 0) {
    priorities.push({
      text: `${accountability!.statusSummary.open} open executive actions`,
      href: "/?tab=executive-accountability",
    });
  }

  for (const row of data?.bestTerritories.slice(0, 3) ?? []) {
    opportunities.push({
      text: `${row.dmName} — health ${row.healthScore} (${row.healthLabel})`,
      href: "/?tab=dm-scorecards",
    });
  }

  for (const row of pipeline?.executive.bestConversionTerritories.slice(0, 2) ?? []) {
    opportunities.push({
      text: `${row.territoryLabel} — ${row.conversionPct}% conversion`,
      href: "/?tab=pipeline-intelligence",
    });
  }

  if (insights && insights.candidatesLast7Days > 0) {
    opportunities.push({
      text: `${insights.candidatesLast7Days} new applicants in the last 7 days`,
      href: "/?tab=candidates",
    });
  }

  const readyMel =
    pipeline?.slaTracking.find((row) => row.stage === "Ready for MEL")?.count ??
    pipeline?.stages.find((s) => s.stage === "Ready for MEL")?.count;
  if (readyMel && readyMel > 0) {
    opportunities.push({
      text: `${readyMel} candidate${readyMel === 1 ? "" : "s"} ready for MEL`,
      href: "/?tab=candidates&queue=ready-mel",
    });
  }

  return {
    topRisks: uniqueLines(risks, 4),
    topPriorities: uniqueLines(priorities, 4),
    topOpportunities: uniqueLines(opportunities, 4),
  };
}
