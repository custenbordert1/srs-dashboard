import type { BreezyCandidate } from "@/lib/breezy-api";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import {
  loadPrioritizationCohort,
  type P156PrioritizationCohort,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";

export type P157DecisionCohort = P156PrioritizationCohort & {
  auditEvents: PaperworkAutomationAuditEvent[];
  candidatesById: Map<string, BreezyCandidate>;
};

export async function loadDecisionCohort(): Promise<P157DecisionCohort> {
  const [cohort, auditEvents, store] = await Promise.all([
    loadPrioritizationCohort(),
    loadPaperworkAutomationAuditLog(),
    readIngestionStore(),
  ]);

  const candidatesById = new Map(
    listIngestedCandidates(store).map((candidate) => [candidate.candidateId, candidate]),
  );

  return {
    ...cohort,
    auditEvents,
    candidatesById,
  };
}
