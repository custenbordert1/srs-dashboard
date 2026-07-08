import type { PaperworkStatus } from "@/lib/candidate-workflow-types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";
import { mapP157ToP169Outcome } from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import type {
  P171CandidateLifecycleRecord,
  P171ExceptionCategory,
  P171LifecycleState,
  P171SignatureStatus,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";

const MANUAL_REVIEW_ACTIONS = new Set<P157CandidateDecision["action"]>([
  "Manual Review",
  "Candidate Duplicate",
  "Request Missing Documents",
  "Review Questionnaire",
  "Escalate To DM",
]);

export function mapPaperworkToSignatureStatus(
  paperworkStatus: PaperworkStatus | null | undefined,
): P171SignatureStatus {
  switch (paperworkStatus) {
    case "sent":
      return "SENT";
    case "viewed":
      return "VIEWED";
    case "signed":
      return "SIGNED";
    case "declined":
      return "DECLINED";
    case "failed":
      return "EXPIRED";
    default:
      return "NOT_SENT";
  }
}

export function categorizeP171Exception(decision: P157CandidateDecision): {
  category: P171ExceptionCategory;
  reason: string;
} {
  if (decision.action === "Candidate Duplicate") {
    return { category: "duplicate", reason: "Possible duplicate candidate" };
  }
  if (!decision.email?.trim()) {
    return { category: "missing_email", reason: "Missing candidate email" };
  }
  if (decision.confidence < 80) {
    return { category: "low_confidence", reason: `Confidence ${decision.confidence} below threshold` };
  }
  if (decision.action === "Request Missing Documents") {
    return { category: "manual_review", reason: "Missing required documents" };
  }
  if (decision.action === "Review Questionnaire") {
    return { category: "manual_review", reason: "Unexpected classification" };
  }
  if (decision.action === "Escalate To DM") {
    return { category: "manual_review", reason: "Workflow inconsistency" };
  }
  return { category: "manual_review", reason: decision.action };
}

/**
 * Deterministic lifecycle state from P157 decision + workflow record.
 * Reuses P169 outcome mapping for send/signature/MEL eligibility.
 */
export function resolveP171LifecycleState(input: {
  decision: P157CandidateDecision;
  workflow: CandidateWorkflowRecord | null;
  minimumConfidence: number;
  estimatedNextRun: string | null;
}): {
  state: P171LifecycleState;
  signatureStatus: P171SignatureStatus;
  exceptionCategory: P171ExceptionCategory | null;
  exceptionReason: string | null;
} {
  const { decision, workflow, minimumConfidence, estimatedNextRun } = input;
  const outcome = mapP157ToP169Outcome(decision, minimumConfidence, estimatedNextRun);
  const signatureStatus = mapPaperworkToSignatureStatus(workflow?.paperworkStatus);
  const workflowStatus = workflow?.workflowStatus ?? decision.workflowStatus;

  if (workflowStatus === "Active Rep") {
    return { state: "COMPLETED", signatureStatus, exceptionCategory: null, exceptionReason: null };
  }
  if (workflowStatus === "Loaded in MEL") {
    return { state: "PLACED", signatureStatus, exceptionCategory: null, exceptionReason: null };
  }
  if (workflowStatus === "Ready for MEL" || outcome.outcome === "READY_FOR_MEL") {
    return { state: "READY_FOR_MEL", signatureStatus, exceptionCategory: null, exceptionReason: null };
  }
  if (signatureStatus === "SIGNED" || workflowStatus === "Signed") {
    return { state: "SIGNED", signatureStatus, exceptionCategory: null, exceptionReason: null };
  }
  if (signatureStatus === "DECLINED") {
    return {
      state: "EXCEPTION",
      signatureStatus,
      exceptionCategory: "signature_declined",
      exceptionReason: "Candidate declined paperwork signature",
    };
  }
  if (signatureStatus === "EXPIRED") {
    return {
      state: "EXCEPTION",
      signatureStatus,
      exceptionCategory: "paperwork_expired",
      exceptionReason: "Paperwork signature request expired or failed",
    };
  }
  if (
    signatureStatus === "SENT" ||
    signatureStatus === "VIEWED" ||
    signatureStatus === "PARTIALLY_COMPLETED" ||
    outcome.outcome === "WAIT_SIGNATURE" ||
    workflowStatus === "Paperwork Sent"
  ) {
    return { state: "WAITING_SIGNATURE", signatureStatus, exceptionCategory: null, exceptionReason: null };
  }
  if (outcome.outcome === "NEEDS_MANUAL_REVIEW" || MANUAL_REVIEW_ACTIONS.has(decision.action)) {
    const { category, reason } = categorizeP171Exception(decision);
    return { state: "EXCEPTION", signatureStatus, exceptionCategory: category, exceptionReason: reason };
  }
  if (outcome.outcome === "REJECT") {
    return {
      state: "EXCEPTION",
      signatureStatus,
      exceptionCategory: "manual_review",
      exceptionReason: decision.action,
    };
  }
  if (outcome.outcome === "AUTO_SEND_PAPERWORK") {
    return { state: "APPROVED", signatureStatus, exceptionCategory: null, exceptionReason: null };
  }
  if (
    decision.action === "Manual Review" ||
    decision.action === "Assign Recruiter" ||
    decision.action === "Follow Up Today"
  ) {
    return { state: "UNDER_REVIEW", signatureStatus, exceptionCategory: null, exceptionReason: null };
  }
  return { state: "DISCOVERED", signatureStatus, exceptionCategory: null, exceptionReason: null };
}

export function createP171CandidateRecord(input: {
  decision: P157CandidateDecision;
  workflow: CandidateWorkflowRecord | null;
  minimumConfidence: number;
  estimatedNextRun: string | null;
  now?: string;
}): P171CandidateLifecycleRecord {
  const now = input.now ?? new Date().toISOString();
  const resolved = resolveP171LifecycleState(input);

  return {
    candidateId: input.decision.candidateId,
    candidateName: input.decision.candidateName,
    email: input.decision.email,
    position: input.decision.position,
    state: resolved.state,
    signatureStatus: resolved.signatureStatus,
    exceptionCategory: resolved.exceptionCategory,
    exceptionReason: resolved.exceptionReason,
    exceptionResolvedAt: null,
    confidence: input.decision.confidence,
    p157Action: input.decision.action,
    reminderCount: 0,
    lastReminderAt: null,
    discoveredAt: now,
    evaluatedAt: now,
    paperworkSentAt:
      resolved.state === "PAPERWORK_SENT" || resolved.state === "WAITING_SIGNATURE"
        ? input.workflow?.paperworkSentAt ?? now
        : null,
    signedAt: input.workflow?.paperworkSignedAt ?? null,
    readyForMelAt: resolved.state === "READY_FOR_MEL" ? now : null,
    lastProcessedCycleId: null,
    transitions: [],
    updatedAt: now,
  };
}

export function resolveP171StateFromWorkflow(
  workflow: CandidateWorkflowRecord | null,
): P171LifecycleState | null {
  if (!workflow) return null;
  const ws = workflow.workflowStatus;
  const sig = mapPaperworkToSignatureStatus(workflow.paperworkStatus);
  if (ws === "Active Rep") return "COMPLETED";
  if (ws === "Loaded in MEL") return "PLACED";
  if (ws === "Ready for MEL") return "READY_FOR_MEL";
  if (sig === "SIGNED" || ws === "Signed") return "SIGNED";
  if (sig === "DECLINED" || sig === "EXPIRED") return "EXCEPTION";
  if (sig === "SENT" || sig === "VIEWED" || ws === "Paperwork Sent") return "WAITING_SIGNATURE";
  return null;
}

export function shouldSkipP171Candidate(
  record: P171CandidateLifecycleRecord | null,
  cycleId: string,
): boolean {
  if (!record) return false;
  if (record.lastProcessedCycleId === cycleId) return true;
  if (record.state === "COMPLETED" || record.state === "PLACED") return true;
  if (record.state === "EXCEPTION" && !record.exceptionResolvedAt) return true;
  return false;
}

export function summarizeP171Candidates(records: P171CandidateLifecycleRecord[]) {
  const exceptions = records.filter((r) => r.state === "EXCEPTION" && !r.exceptionResolvedAt);
  const automated = records.filter(
    (r) =>
      r.state === "PAPERWORK_SENT" ||
      r.state === "WAITING_SIGNATURE" ||
      r.state === "SIGNED" ||
      r.state === "READY_FOR_MEL",
  );
  return {
    total: records.length,
    discovered: records.filter((r) => r.state === "DISCOVERED").length,
    underReview: records.filter((r) => r.state === "UNDER_REVIEW").length,
    approved: records.filter((r) => r.state === "APPROVED").length,
    paperworkSent: records.filter((r) => r.state === "PAPERWORK_SENT").length,
    waitingSignature: records.filter((r) => r.state === "WAITING_SIGNATURE").length,
    signed: records.filter((r) => r.state === "SIGNED").length,
    readyForMel: records.filter((r) => r.state === "READY_FOR_MEL").length,
    placed: records.filter((r) => r.state === "PLACED").length,
    completed: records.filter((r) => r.state === "COMPLETED").length,
    exceptions: exceptions.length,
    automated: automated.length,
    recruiterInterventionsSaved: automated.length,
    automationPercent:
      records.length > 0 ? Math.round((automated.length / records.length) * 100) : 0,
    exceptionPercent:
      records.length > 0 ? Math.round((exceptions.length / records.length) * 100) : 0,
  };
}
