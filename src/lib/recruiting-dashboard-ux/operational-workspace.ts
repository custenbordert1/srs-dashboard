import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { VariantPerformanceRow } from "@/lib/recruiting-decision-intelligence/types";
import type { RecruiterActionItem } from "@/lib/recruiting-dashboard-ux/recruiter-action-catalog";
import { filterActionsByLane } from "@/lib/recruiting-dashboard-ux/recruiter-action-catalog";
import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";
import type {
  JobRoutingContext,
  RoutePack,
  RoutingIntelligenceSnapshot,
} from "@/lib/routing-intelligence";

export type OperationalWorkspaceJob = {
  jobId: string;
  jobTitle: string;
  city: string;
  state: string;
  agingDays: number | null;
  applicantCount: number;
  territoryRiskScore: number;
  nearbyActiveReps: number;
  recommendedAction: string;
  expectedOutcome: string;
  severity: DmAlertPriority;
  metroExpansion: string[];
  payRadiusNotes: string[];
  summaryBullets: string[];
  escalations: RecruiterEscalationQueueItem[];
  variants: VariantPerformanceRow[];
  variantSummary: string;
  immediateActions: RecruiterActionItem[];
  strategicActions: RecruiterActionItem[];
  routing: JobRoutingContext | null;
  relatedRoutePacks: RoutePack[];
};

function variantSummaryFor(rows: VariantPerformanceRow[]): string {
  if (rows.length === 0) return "No linked variants";
  const best = rows.find((row) => row.marker === "best");
  const pending = rows.filter((row) => row.queueStatus === "pending").length;
  const approved = rows.filter(
    (row) => row.queueStatus === "approved" && !row.published,
  ).length;
  const parts = [
    `${rows.length} variant(s)`,
    best ? `best: #${best.variantIndex + 1} (${best.applicants} appl)` : null,
    pending > 0 ? `${pending} pending` : null,
    approved > 0 ? `${approved} approved unpublished` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function buildOperationalWorkspaceJobs(
  snapshot: RecruitingIntelligenceSnapshot,
  escalations: RecruiterEscalationQueueItem[] = [],
  allActions: RecruiterActionItem[] = [],
  limit = 8,
  routingIntelligence?: RoutingIntelligenceSnapshot | null,
): OperationalWorkspaceJob[] {
  const routing = routingIntelligence ?? snapshot.routingIntelligence ?? null;
  const packsById = new Map((routing?.routePacks ?? []).map((pack) => [pack.routePackId, pack]));
  const decision = snapshot.decisionIntelligence;
  const rankings = new Map(snapshot.jobRankings.map((row) => [row.jobId, row]));
  const variantsByJob = new Map<string, VariantPerformanceRow[]>();

  for (const variant of decision?.variantPerformance ?? []) {
    const list = variantsByJob.get(variant.sourceJobId) ?? [];
    list.push(variant);
    variantsByJob.set(variant.sourceJobId, list);
  }

  const jobs: OperationalWorkspaceJob[] = [];

  for (const coverage of decision?.coverageRecommendations ?? []) {
    const ranking = rankings.get(coverage.jobId);
    const jobEscalations = escalations.filter((row) => row.relatedJobId === coverage.jobId);
    const variants = variantsByJob.get(coverage.jobId) ?? [];
    const jobActions = allActions.filter((row) => row.jobId === coverage.jobId);
    const immediate = filterActionsByLane(jobActions, "immediate");
    const strategic = filterActionsByLane(jobActions, "strategic");
    const topImmediate = immediate[0];
    const payRadius = strategic
      .filter((row) => row.actionType === "increase-pay" || row.actionType === "expand-radius")
      .map((row) => row.title);

    const severity: DmAlertPriority =
      coverage.staffingRiskScore >= 130
        ? "critical"
        : coverage.staffingRiskScore >= 90
          ? "high"
          : "medium";

    const jobRouting = routing?.jobContexts[coverage.jobId] ?? null;
    const relatedRoutePacks = (jobRouting?.relatedRoutePackIds ?? [])
      .map((id) => packsById.get(id))
      .filter((pack): pack is RoutePack => pack !== undefined);

    jobs.push({
      jobId: coverage.jobId,
      jobTitle: coverage.jobTitle,
      city: coverage.city,
      state: coverage.state,
      agingDays: coverage.jobAgeDays,
      applicantCount: ranking?.applicantCount ?? 0,
      territoryRiskScore: coverage.staffingRiskScore,
      nearbyActiveReps: coverage.nearbyActiveReps25Mi,
      recommendedAction: topImmediate?.title ?? coverage.summaryBullets[0] ?? "Review staffing risk",
      expectedOutcome:
        topImmediate?.expectedOutcome ?? "Stabilize applicant flow and coverage manually.",
      severity,
      metroExpansion: coverage.recommendedExpansionCities,
      payRadiusNotes: payRadius,
      summaryBullets: coverage.summaryBullets,
      escalations: jobEscalations,
      variants,
      variantSummary: variantSummaryFor(variants),
      immediateActions: immediate,
      strategicActions: strategic,
      routing: jobRouting,
      relatedRoutePacks,
    });
  }

  return jobs.sort((a, b) => b.territoryRiskScore - a.territoryRiskScore).slice(0, limit);
}
