import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";
import type {
  P169CandidateEvaluation,
  P169CandidateOutcome,
} from "@/lib/p169-autonomous-recruiting-orchestrator/types";

const MANUAL_REVIEW_ACTIONS = new Set<P157CandidateDecision["action"]>([
  "Manual Review",
  "Candidate Duplicate",
  "Request Missing Documents",
  "Review Questionnaire",
  "Escalate To DM",
]);

export function mapP157ToP169Outcome(
  decision: P157CandidateDecision,
  minimumConfidence: number,
  estimatedNextRun: string | null,
): P169CandidateEvaluation {
  const blockingFactors: string[] = [];
  let outcome: P169CandidateOutcome;

  if (decision.action === "Candidate Duplicate") {
    outcome = "NEEDS_MANUAL_REVIEW";
    blockingFactors.push(decision.action);
  } else if (
    decision.action === "Reject Candidate" ||
    decision.action === "Position Closed"
  ) {
    outcome = "REJECT";
    blockingFactors.push(decision.action);
  } else if (decision.action === "Ready For MEL") {
    outcome = "READY_FOR_MEL";
  } else if (decision.action === "Wait For Candidate") {
    outcome = "WAIT_SIGNATURE";
  } else if (MANUAL_REVIEW_ACTIONS.has(decision.action) || decision.confidence < minimumConfidence) {
    outcome = "NEEDS_MANUAL_REVIEW";
    if (decision.confidence < minimumConfidence) {
      blockingFactors.push(`Confidence ${decision.confidence} below threshold ${minimumConfidence}`);
    }
    blockingFactors.push(decision.action);
  } else if (decision.action === "Send Paperwork" && decision.confidence >= minimumConfidence) {
    outcome = "AUTO_SEND_PAPERWORK";
  } else {
    outcome = "WAIT_NEXT_CYCLE";
    blockingFactors.push(decision.action);
  }

  return {
    candidateId: decision.candidateId,
    candidateName: decision.candidateName,
    email: decision.email,
    outcome,
    confidence: decision.confidence,
    reason: decision.reasoning.slice(0, 3).join(" · ") || decision.action,
    blockingFactors,
    estimatedNextAction: decision.action,
    estimatedNextRun,
    p157Action: decision.action,
    recruiter: decision.recruiter,
    position: decision.position,
    workflowStatus: decision.workflowStatus,
  };
}

export function summarizeP169Evaluations(evaluations: P169CandidateEvaluation[]) {
  return {
    candidatesEvaluated: evaluations.length,
    autoSendEligible: evaluations.filter((e) => e.outcome === "AUTO_SEND_PAPERWORK").length,
    exceptionsCreated: evaluations.filter((e) => e.outcome === "NEEDS_MANUAL_REVIEW").length,
    readyForMel: evaluations.filter((e) => e.outcome === "READY_FOR_MEL").length,
    waitingSignature: evaluations.filter((e) => e.outcome === "WAIT_SIGNATURE").length,
    skipped: evaluations.filter(
      (e) => e.outcome === "WAIT_NEXT_CYCLE" || e.outcome === "REJECT",
    ).length,
  };
}
