import type { AiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center";
import type { NotificationCenterSnapshot } from "@/lib/notification-engine";
import type { TerritoryIntelligenceCenterSnapshot } from "@/lib/territory-intelligence/types";
import type { StatusTone } from "@/lib/ui/status-tone";
import { toneFromCount, toneFromCoverageRisk } from "@/lib/ui/status-tone";
import type { ExecutiveKpiTrend } from "@/components/ui/executive-kpi-card";

export type ExecutiveSummaryKpi = {
  id: string;
  label: string;
  value: string;
  tone: StatusTone;
  trend?: ExecutiveKpiTrend;
  hint?: string;
};

export type ExecutiveSummaryDisplay = {
  kpis: ExecutiveSummaryKpi[];
  briefing: AiCommandCenterSnapshot["briefing"] | null;
  priorityAlerts: {
    critical: string[];
    high: string[];
    medium: string[];
  };
  territoryHealth: Array<{ dmName: string; score: number; coverageRisk: number }>;
  recruiterWorkload: Array<{ dmName: string; score: number }>;
  applicantTrend: { direction: "up" | "down" | "flat"; label: string } | null;
  pipelineSummary: { hired: number; paperworkSent: number; readyForMel: number } | null;
  dmNeedingHelp: string | null;
  opportunitiesAtRisk: number;
};

export function buildExecutiveSummaryDisplay(input: {
  territory: TerritoryIntelligenceCenterSnapshot | null;
  ai: AiCommandCenterSnapshot | null;
  notifications: NotificationCenterSnapshot | null;
  activeCandidates: number | null;
  avgTimeToFillDays: number | null;
  openCalls: number | null;
}): ExecutiveSummaryDisplay {
  const territories = input.territory?.territories ?? [];
  const openCalls =
    input.openCalls ??
    territories.reduce((sum, row) => sum + row.metrics.openCalls, 0);
  const zeroApplicantJobs = territories.reduce((sum, row) => sum + row.metrics.zeroApplicantJobs, 0);
  const hires7d = territories.reduce((sum, row) => sum + row.metrics.hiresLast7Days, 0);
  const coverageRisk = territories.length
    ? Math.max(...territories.map((row) => row.metrics.coverageRiskScore))
    : 0;
  const activeCandidates = input.activeCandidates ?? 0;
  const avgFill =
    input.avgTimeToFillDays != null ? `${Math.round(input.avgTimeToFillDays)}d` : "—";

  const velocity = territories[0]?.metrics.applicantVelocity;
  const applicantTrend = velocity
    ? {
        direction: velocity.direction,
        label:
          velocity.direction === "flat"
            ? "Flat vs prior 7d"
            : `${velocity.delta >= 0 ? "+" : ""}${velocity.delta} vs prior 7d`,
      }
    : null;

  const highestRisk = input.territory?.executiveRollup.highestRiskTerritories ?? [];
  const dmNeedingHelp = highestRisk[0]?.dmName ?? null;
  const opportunitiesAtRisk = input.ai?.opportunityRisks.filter((row) => row.overallRiskScore >= 70).length ?? 0;

  const pipelineSummary = territories.length
    ? {
        hired: territories.reduce((sum, row) => sum + row.metrics.hiresLast7Days, 0),
        paperworkSent: 0,
        readyForMel: 0,
      }
    : null;

  const activeAlerts = input.notifications?.notifications.filter((row) => row.status === "active") ?? [];

  return {
    kpis: [
      {
        id: "open-calls",
        label: "Open Calls",
        value: openCalls.toLocaleString(),
        tone: toneFromCount(openCalls, 15, 30),
        hint: "MEL demand signals",
      },
      {
        id: "active-candidates",
        label: "Active Candidates",
        value: activeCandidates.toLocaleString(),
        tone: activeCandidates > 0 ? "healthy" : "warning",
        hint: "In recruiting pipeline",
      },
      {
        id: "hires-7d",
        label: "Hires (7 Days)",
        value: hires7d.toLocaleString(),
        tone: hires7d > 0 ? "healthy" : "warning",
        trend: applicantTrend ?? undefined,
      },
      {
        id: "coverage-risk",
        label: "Coverage Risk",
        value: String(coverageRisk),
        tone: toneFromCoverageRisk(coverageRisk),
        hint: "Highest territory score",
      },
      {
        id: "zero-applicant-jobs",
        label: "Zero Applicant Jobs",
        value: zeroApplicantJobs.toLocaleString(),
        tone: toneFromCount(zeroApplicantJobs, 3, 8),
      },
      {
        id: "avg-time-to-fill",
        label: "Avg Time To Fill",
        value: avgFill,
        tone: input.avgTimeToFillDays != null && input.avgTimeToFillDays > 21 ? "warning" : "info",
        hint: "Workforce ops rollup",
      },
    ],
    briefing: input.ai?.briefing ?? null,
    priorityAlerts: {
      critical: activeAlerts.filter((row) => row.severity === "critical").slice(0, 5).map((row) => row.title),
      high: activeAlerts.filter((row) => row.severity === "warning").slice(0, 5).map((row) => row.title),
      medium: activeAlerts.filter((row) => row.severity === "info").slice(0, 5).map((row) => row.title),
    },
    territoryHealth: highestRisk.slice(0, 4).map((row) => ({
      dmName: String(row.dmName),
      score: row.attentionScore,
      coverageRisk: row.metrics.coverageRiskScore,
    })),
    recruiterWorkload: [...territories]
      .sort((a, b) => b.metrics.recruiterWorkloadScore - a.metrics.recruiterWorkloadScore)
      .slice(0, 4)
      .map((row) => ({ dmName: String(row.dmName), score: row.metrics.recruiterWorkloadScore })),
    applicantTrend,
    pipelineSummary,
    dmNeedingHelp,
    opportunitiesAtRisk,
  };
}
