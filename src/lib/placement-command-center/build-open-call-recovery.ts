import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { calendarDaysSince } from "@/lib/candidate-action-sla";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { OpenCallRecoveryAction } from "@/lib/placement-command-center/types";

const AGING_DAYS = 7;

export function buildOpenCallRecoveryActions(input: {
  opportunities: MelOpportunity[];
  coverage: CoverageRiskSnapshot | null;
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  fetchedAt: string;
}): OpenCallRecoveryAction[] {
  const referenceMs = Date.parse(input.fetchedAt);
  const open = input.opportunities.filter((row) => row.openStatus && !row.isStaffed);
  const coverageById = new Map(
    input.coverage?.opportunities.map((row) => [row.opportunityId, row]) ?? [],
  );

  const candidatesByState = new Map<string, number>();
  const assignedByState = new Map<string, number>();
  for (const candidate of input.candidates) {
    const state = normalizeStateCode(candidate.state);
    candidatesByState.set(state, (candidatesByState.get(state) ?? 0) + 1);
    const row = buildBaselineWorkflowRow(candidate, input.workflows?.[candidate.candidateId]);
    if (row.assignedRecruiter && row.assignedRecruiter !== "Unassigned") {
      assignedByState.set(state, (assignedByState.get(state) ?? 0) + 1);
    }
  }

  const actions: OpenCallRecoveryAction[] = [];

  for (const opportunity of open) {
    const coverageRow = coverageById.get(opportunity.opportunityId);
    const state = normalizeStateCode(opportunity.state);
    const pipeline = candidatesByState.get(state) ?? 0;
    const assigned = assignedByState.get(state) ?? 0;
    const agingDays = calendarDaysSince(opportunity.projectNo || input.fetchedAt, referenceMs);
    const issues: string[] = [];

    if (pipeline === 0) issues.push("No candidates in pipeline");
    if (pipeline > 0 && pipeline < 3) issues.push("Low candidate pipeline");
    if (assigned === 0) issues.push("No recruiter-assigned candidates");
    if (coverageRow && coverageRow.pipelineScore < 35) issues.push("Weak applicant flow");
    if (agingDays !== null && agingDays >= AGING_DAYS) issues.push(`Aging ${agingDays} days`);

    if (issues.length === 0) continue;

    const severity =
      issues.some((issue) => issue.startsWith("Aging") || issue.includes("No candidates"))
        ? "critical"
        : issues.length >= 2
          ? "high"
          : "medium";

    actions.push({
      id: `recovery:${opportunity.opportunityId}`,
      opportunityId: opportunity.opportunityId,
      store: opportunity.storeName || opportunity.city,
      client: opportunity.client,
      project: opportunity.projectName,
      issue: issues.join(" · "),
      suggestedAction:
        severity === "critical"
          ? "Escalate to DM and assign recruiter coverage immediately"
          : "Boost sourcing and assign pipeline owner for this store",
      severity,
      agingDays,
    });
  }

  return actions
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2 };
      return rank[a.severity] - rank[b.severity];
    })
    .slice(0, 30);
}
