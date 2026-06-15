import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { PlacementCoverageRisk, StoreCoverageRow } from "@/lib/placement-command-center/types";

function riskFromCoverage(coveragePercent: number, staffingRisk: StoreCoverageRow["staffingRisk"]): PlacementCoverageRisk {
  if (staffingRisk === "RED" || coveragePercent < 40) return "red";
  if (staffingRisk === "YELLOW" || coveragePercent < 65) return "yellow";
  return "green";
}

export function buildStoreCoverageRows(input: {
  opportunities: MelOpportunity[];
  coverage: CoverageRiskSnapshot | null;
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
}): StoreCoverageRow[] {
  const open = input.opportunities.filter((row) => row.openStatus && !row.isStaffed);
  const coverageById = new Map(
    input.coverage?.opportunities.map((row) => [row.opportunityId, row]) ?? [],
  );

  const candidatesByState = new Map<string, BreezyCandidate[]>();
  for (const candidate of input.candidates) {
    const state = normalizeStateCode(candidate.state);
    const list = candidatesByState.get(state) ?? [];
    list.push(candidate);
    candidatesByState.set(state, list);
  }

  return open
    .map((opportunity) => {
      const coverageRow = coverageById.get(opportunity.opportunityId);
      const state = normalizeStateCode(opportunity.state);
      const stateCandidates = candidatesByState.get(state) ?? [];

      let candidatesAssigned = 0;
      let candidatesInPipeline = 0;
      for (const candidate of stateCandidates) {
        const row = buildBaselineWorkflowRow(candidate, input.workflows?.[candidate.candidateId]);
        if (row.assignedRecruiter && row.assignedRecruiter !== "Unassigned") {
          candidatesAssigned += 1;
        }
        if (
          row.workflowStatus !== "Not Qualified" &&
          row.workflowStatus !== "Active Rep" &&
          (isPaperworkPendingStatus(row.workflowStatus) ||
            isMelReadyStatus(row.workflowStatus) ||
            row.workflowStatus === "Qualified" ||
            row.workflowStatus === "Needs Review")
        ) {
          candidatesInPipeline += 1;
        }
      }

      const coveragePercent = coverageRow?.coverageScore ?? 0;
      const staffingRisk = coverageRow?.staffingRisk ?? "YELLOW";

      return {
        opportunityId: opportunity.opportunityId,
        store: opportunity.storeName || opportunity.city,
        client: opportunity.client,
        project: opportunity.projectName,
        openCalls: 1,
        candidatesAssigned,
        candidatesInPipeline,
        coveragePercent,
        staffingRisk,
        risk: riskFromCoverage(coveragePercent, staffingRisk),
      };
    })
    .sort((a, b) => {
      const rank = { red: 0, yellow: 1, green: 2 };
      return rank[a.risk] - rank[b.risk] || a.coveragePercent - b.coveragePercent;
    })
    .slice(0, 60);
}
