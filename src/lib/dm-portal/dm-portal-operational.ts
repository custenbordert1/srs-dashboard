import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import {
  buildRecruitingPipelineFromDashboardSnapshot,
  buildTerritoryMetricsFromDashboardSnapshot,
  countNeedsAttentionFromAlertSummary,
  resolveCoverageHealthTier,
  type CoverageHealthTier,
} from "@/lib/territory-intelligence";

export type { CoverageHealthTier } from "@/lib/territory-intelligence";

export type DmPortalTerritorySummary = {
  states: string[];
  stateCount: number;
  openJobs: number;
  openCalls: number;
  activeReps: number;
  coveragePercent: number;
  coverageTier: CoverageHealthTier;
};

export type DmPortalPipelineSummary = {
  applicantsLast7Days: number;
  paperworkSent: number;
  readyForMel: number;
  hired: number;
};

export type DmPortalOperationalView = {
  territory: DmPortalTerritorySummary;
  pipeline: DmPortalPipelineSummary;
  needsAttentionTotal: number;
};

export const DM_PORTAL_SECTION_IDS = {
  territorySummary: "dm-territory-summary",
  actionCenter: "dm-action-center",
  territoryHealth: "dm-territory-health",
  recruitingPipeline: "dm-recruiting-pipeline",
  alertKpis: "dm-alert-kpis",
  needsAttention: "dm-needs-attention",
  priorityAlerts: "dm-priority-alerts",
  candidates: "dm-candidates",
  openOpportunities: "dm-open-opportunities",
  coverageIssues: "dm-coverage-issues",
  candidateQueue: "dm-candidate-queue",
  quickNav: "dm-quick-nav",
} as const;

export const DM_PORTAL_NAV_LINKS = [
  {
    id: "summary",
    label: "Territory summary",
    description: "Jobs, calls, health, and alerts",
    href: `#${DM_PORTAL_SECTION_IDS.territorySummary}`,
  },
  {
    id: "actions",
    label: "Action center",
    description: "Request ads, recruiters, and track coverage",
    href: `#${DM_PORTAL_SECTION_IDS.actionCenter}`,
  },
  {
    id: "recruiting",
    label: "Recruiting pipeline",
    description: "Applicant flow and onboarding",
    href: `#${DM_PORTAL_SECTION_IDS.recruitingPipeline}`,
  },
  {
    id: "alerts",
    label: "Alerts",
    description: "Prioritized territory risks",
    href: `#${DM_PORTAL_SECTION_IDS.priorityAlerts}`,
  },
  {
    id: "candidates",
    label: "Candidates",
    description: "Top scored and recent applicants",
    href: `#${DM_PORTAL_SECTION_IDS.candidates}`,
  },
  {
    id: "opportunities",
    label: "Open opportunities",
    description: "Unstaffed MEL demand in territory",
    href: `#${DM_PORTAL_SECTION_IDS.openOpportunities}`,
  },
  {
    id: "coverage",
    label: "Coverage issues",
    description: "Risk cities and shortage signals",
    href: `#${DM_PORTAL_SECTION_IDS.coverageIssues}`,
  },
] as const;

const NEEDS_ATTENTION_TOP_N = 10;

export { resolveCoverageHealthTier } from "@/lib/territory-intelligence";

export function coverageTierLabel(tier: CoverageHealthTier): string {
  switch (tier) {
    case "green":
      return "Healthy";
    case "yellow":
      return "Needs attention";
    default:
      return "Critical";
  }
}

export function coverageTierStyles(tier: CoverageHealthTier): {
  border: string;
  bg: string;
  text: string;
  meter: string;
} {
  switch (tier) {
    case "green":
      return {
        border: "border-emerald-500/40",
        bg: "bg-emerald-500/10",
        text: "text-emerald-200",
        meter: "bg-emerald-500",
      };
    case "yellow":
      return {
        border: "border-amber-500/40",
        bg: "bg-amber-500/10",
        text: "text-amber-100",
        meter: "bg-amber-500",
      };
    default:
      return {
        border: "border-red-500/40",
        bg: "bg-red-500/10",
        text: "text-red-200",
        meter: "bg-red-500",
      };
  }
}

/** @deprecated Prefer `TerritoryMetrics.readyForMel` from territory intelligence rollup. */
export function countReadyForMel(snapshot: DmDashboardSnapshot): number {
  return buildTerritoryMetricsFromDashboardSnapshot(snapshot).readyForMel;
}

export function buildDmPortalOperationalView(snapshot: DmDashboardSnapshot): DmPortalOperationalView {
  const metrics = buildTerritoryMetricsFromDashboardSnapshot(snapshot);
  const pipeline = buildRecruitingPipelineFromDashboardSnapshot(snapshot);

  return {
    territory: {
      states: snapshot.territoryStates,
      stateCount: snapshot.territoryStates.length,
      openJobs: metrics.openJobs,
      openCalls: metrics.openCalls,
      activeReps: metrics.activeReps,
      coveragePercent: metrics.coveragePercent,
      coverageTier: metrics.coverageTier,
    },
    pipeline,
    needsAttentionTotal: countNeedsAttentionFromAlertSummary(snapshot),
  };
}

export function topNeedsAttentionAlerts(snapshot: DmDashboardSnapshot): DmPrioritizedAlert[] {
  return snapshot.prioritizedAlerts.slice(0, NEEDS_ATTENTION_TOP_N);
}

export function resolveDmPortalAlertHref(alert: DmPrioritizedAlert): string {
  const base = `/dm#${DM_PORTAL_SECTION_IDS.needsAttention}`;
  if (alert.jobId) {
    return `/dm?section=needs-attention&jobId=${encodeURIComponent(alert.jobId)}#${DM_PORTAL_SECTION_IDS.needsAttention}`;
  }
  if (alert.state) {
    return `/dm?section=coverage&state=${encodeURIComponent(alert.state)}#${DM_PORTAL_SECTION_IDS.coverageIssues}`;
  }
  return base;
}

export function severityLabel(priority: DmPrioritizedAlert["priority"]): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
