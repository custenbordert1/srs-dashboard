import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace";
import { buildCommunicationsHistory } from "@/lib/p259-candidate-operations/communications";
import { buildRecruitingIntelligence } from "@/lib/p259-candidate-operations/intelligence";
import { buildPaperworkPanel } from "@/lib/p259-candidate-operations/paperwork-panel";
import type { CandidateOpsApplicant } from "@/lib/p259-candidate-operations/types";
import { buildWorkflowStages } from "@/lib/p259-candidate-operations/workflow-panel";

/**
 * Enrich a P258 hiring workspace row with P259 operations panels.
 * Pure — no network, no writes.
 */
export function enrichCandidateOpsApplicant(
  row: HiringWorkspaceApplicantRow,
): CandidateOpsApplicant {
  return {
    ...row,
    intelligence: buildRecruitingIntelligence(row),
    communications: buildCommunicationsHistory(row),
    paperworkPanel: buildPaperworkPanel(row),
    workflowStages: buildWorkflowStages(row),
  };
}

export function enrichCandidateOpsApplicants(
  rows: HiringWorkspaceApplicantRow[],
): CandidateOpsApplicant[] {
  return rows.map(enrichCandidateOpsApplicant);
}
