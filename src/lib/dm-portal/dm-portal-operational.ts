import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import { buildDmPortalCardMetrics } from "@/lib/dm-portal/dm-portal-metrics";

export type CoverageHealthTier = "green" | "yellow" | "red";

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
  territoryHealth: "dm-territory-health",
  recruitingPipeline: "dm-recruiting-pipeline",
  needsAttention: "dm-needs-attention",
  openOpportunities: "dm-open-opportunities",
  coverageIssues: "dm-coverage-issues",
  candidateQueue: "dm-candidate-queue",
  quickNav: "dm-quick-nav",
} as const;

export const DM_PORTAL_NAV_LINKS = [
  {
    id: "recruiting",
    label: "Recruiting",
    description: "Pipeline and applicant flow",
    href: `#${DM_PORTAL_SECTION_IDS.recruitingPipeline}`,
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
  {
    id: "queue",
    label: "Candidate queue",
    description: "Recent applicants in your states",
    href: `#${DM_PORTAL_SECTION_IDS.candidateQueue}`,
  },
] as const;

const NEEDS_ATTENTION_TOP_N = 10;

export function resolveCoverageHealthTier(coveragePercent: number): CoverageHealthTier {
  if (coveragePercent >= 80) return "green";
  if (coveragePercent >= 50) return "yellow";
  return "red";
}

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

/**
 * Ready-for-MEL proxy: DD-approved candidates in territory (workflow detail not on DM snapshot).
 */
export function countReadyForMel(snapshot: DmDashboardSnapshot): number {
  return snapshot.onboarding.ddApproved + snapshot.melMatching.bestCandidateForOpenProjects.length;
}

export function buildDmPortalOperationalView(snapshot: DmDashboardSnapshot): DmPortalOperationalView {
  const cards = buildDmPortalCardMetrics(snapshot);
  const coverageTier = resolveCoverageHealthTier(cards.coveragePercent);

  return {
    territory: {
      states: snapshot.territoryStates,
      stateCount: snapshot.territoryStates.length,
      openJobs: cards.openJobs,
      openCalls: cards.openCalls,
      activeReps: cards.activeReps,
      coveragePercent: cards.coveragePercent,
      coverageTier,
    },
    pipeline: {
      applicantsLast7Days: snapshot.candidatesLast7Days,
      paperworkSent: snapshot.onboarding.paperworkSent,
      readyForMel: countReadyForMel(snapshot),
      hired: snapshot.pipeline.counts.hired,
    },
    needsAttentionTotal: cards.needsAttention,
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
