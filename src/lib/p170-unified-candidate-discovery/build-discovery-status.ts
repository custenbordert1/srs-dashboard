import type { BreezyCandidate } from "@/lib/breezy-api";
import { isMtdApplicant } from "@/lib/candidate-ingestion/candidate-queue-scope";
import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import type {
  CandidateWorkflowRecord,
  CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { P170DiscoveryStatus } from "@/lib/p170-unified-candidate-discovery/types";

/**
 * Terminal states are outside the P169 autonomous auto-send scope — either the
 * candidate is done or was rejected.
 */
const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Loaded in MEL",
  "Active Rep",
]);

/** Pre-paperwork states P169 would consider for autonomous paperwork delivery. */
const P169_ACTIONABLE_STATUSES = new Set<CandidateWorkflowStatus>([
  "Applied",
  "Needs Review",
  "Qualified",
  "Paperwork Needed",
]);

/**
 * Builds the six-point discovery checklist entirely from read-only sources:
 * the durable workflow store and MTD scope. It deliberately does NOT invoke the
 * P157 decision dashboard, which performs an idempotent workflow-record backfill
 * (a write). Scope-based signals keep discovery strictly read-only.
 */
export async function buildP170DiscoveryStatus(input: {
  candidate: BreezyCandidate;
  foundInIngestion: boolean;
}): Promise<P170DiscoveryStatus> {
  let record: CandidateWorkflowRecord | undefined;
  try {
    const workflows = await getCandidateWorkflowState();
    record = workflows[input.candidate.candidateId];
  } catch {
    record = undefined;
  }

  const mtdEligible = isMtdApplicant(input.candidate);
  const inScope = input.foundInIngestion && mtdEligible;

  // P157 scores the MTD ingested cohort. A candidate in that cohort (or with an
  // existing workflow record) is within P157's evaluation scope.
  const evaluatedByP157 = inScope || record != null;

  const workflowStatus = record?.workflowStatus ?? null;
  const paperworkAlreadyInFlight =
    record != null && record.paperworkStatus !== "not_sent";

  const eligibleForP169 =
    mtdEligible &&
    !paperworkAlreadyInFlight &&
    (workflowStatus == null || P169_ACTIONABLE_STATUSES.has(workflowStatus)) &&
    (workflowStatus == null || !TERMINAL_STATUSES.has(workflowStatus));

  const paperworkStatus = record
    ? `${paperworkStatusLabel(record.paperworkStatus)}${workflowStatus ? ` (${workflowStatus})` : ""}`
    : "Not sent";

  return {
    foundInBreezy: true,
    foundInIngestion: input.foundInIngestion,
    foundInSearch: true,
    evaluatedByP157,
    eligibleForP169,
    paperworkStatus,
    p157Action: workflowStatus,
    p169Outcome: eligibleForP169 ? "AUTO_SEND_PAPERWORK candidate" : workflowStatus,
  };
}
