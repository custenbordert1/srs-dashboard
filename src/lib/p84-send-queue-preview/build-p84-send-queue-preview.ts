import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { P62P83ApprovalQueueEntry } from "@/lib/p62-p83-approval-preview/types";
import type {
  ApprovalPersistenceSimulation,
  P84SendQueueEntry,
  P84SendQueuePreviewMetrics,
  SendQueueSafetyGate,
} from "@/lib/p84-send-queue-preview/types";

export function simulateApprovalPersistenceRow(
  row: ScoredCandidateWorkflowRow,
  approval: P62P83ApprovalQueueEntry,
): ScoredCandidateWorkflowRow {
  return {
    ...row,
    assignedRecruiter: approval.assignedRecruiter,
    assignedDM: approval.suggestedDm,
    dmNeedsAssignment: false,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    nextActionNeeded: "Send paperwork",
  };
}

function buildApprovalPersistenceSimulation(): ApprovalPersistenceSimulation {
  return {
    simulatedOnly: true,
    p62RecruiterApproved: true,
    dmAssignmentApproved: true,
    p83AdvancementApproved: true,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    detail: "Dry-run persistence — P62, DM, and P83 approvals simulated; no workflow writes.",
  };
}

function buildSafetyGates(input: {
  p84Gates: ReturnType<typeof buildPaperworkSendEligibility>["gates"];
  p84Flags: P84FeatureFlags;
}): SendQueueSafetyGate[] {
  const gates: SendQueueSafetyGate[] = input.p84Gates.map((gate) => ({
    id: gate.id,
    label: gate.label,
    passed: gate.passed,
    detail: gate.detail,
  }));

  gates.push({
    id: "executive_approval",
    label: "Executive approval required",
    passed: false,
    detail: "Manual executive approval required before any live send.",
  });

  gates.push({
    id: "live_send_disabled",
    label: "P84 liveSend disabled",
    passed: !input.p84Flags.liveSend,
    detail: input.p84Flags.liveSend
      ? "WARNING: liveSend is enabled globally — preview forces false."
      : "liveSend disabled (expected for dry run).",
  });

  return gates;
}

export function buildP84SendQueueEntry(input: {
  approval: P62P83ApprovalQueueEntry;
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
  p84Flags: P84FeatureFlags;
}): P84SendQueueEntry {
  const persistedRow = simulateApprovalPersistenceRow(input.row, input.approval);
  const p84 = buildPaperworkSendEligibility({
    row: persistedRow,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  const safetyGates = buildSafetyGates({ p84Gates: p84.gates, p84Flags: input.p84Flags });
  const p84CoreEligible = p84.eligible;
  const duplicateGate = p84.gates.find((g) => g.id === "no_duplicate");
  const emailGate = p84.gates.find((g) => g.id === "valid_email");

  const sendBlockedReason = p84CoreEligible
    ? "Executive approval required — liveSend disabled; no send in dry run."
    : p84.blockingReasons[0] ?? "P84 eligibility gates not satisfied.";

  const inSendQueue = p84CoreEligible;

  return {
    candidateId: input.approval.candidateId,
    candidateName: input.approval.candidateName,
    email: input.row.email?.trim() || "",
    recruiter: input.approval.assignedRecruiter,
    dm: input.approval.suggestedDm,
    jobTitle: input.approval.jobTitle,
    city: input.approval.city,
    state: input.approval.state,
    positionId: input.approval.positionId,
    approvalPersistence: buildApprovalPersistenceSimulation(),
    eligibilityResult: p84CoreEligible ? "eligible" : "blocked",
    sendBlockedReason: inSendQueue ? sendBlockedReason : sendBlockedReason,
    duplicateSendProtection: {
      passed: duplicateGate?.passed ?? true,
      detail: duplicateGate?.detail ?? null,
    },
    liveSend: false,
    inSendQueue,
    safetyGates,
    executiveApprovalRequired: true,
    autoApproveBlocked: true,
  };
}

export function buildMetricsFromEntries(entries: P84SendQueueEntry[]): P84SendQueuePreviewMetrics {
  const inQueue = entries.filter((e) => e.inSendQueue);
  const blocked = entries.filter((e) => !e.inSendQueue);
  return {
    approvalPersistedSimulationCount: entries.length,
    p84EligibleCount: entries.filter((e) => e.eligibilityResult === "eligible").length,
    sendQueueCount: inQueue.length,
    blockedFromSendCount: blocked.length,
    duplicateRiskCount: entries.filter((e) => !e.duplicateSendProtection.passed).length,
    invalidEmailCount: entries.filter((e) => {
      const gate = e.safetyGates.find((g) => g.id === "valid_email");
      return gate != null && !gate.passed;
    }).length,
    liveSendsDisabledCount: entries.length,
  };
}
