import { randomUUID } from "node:crypto";
import type { P204Recommendation } from "@/lib/p204-ai-candidate-qualification/types";
import type {
  CandidateEvaluation,
  Decision,
  DecisionOutcome,
} from "@/lib/candidate-evaluation-orchestrator/types";

/**
 * Map existing P204 recommendation → public Auto-advance / Human Review / Auto-Reject.
 * Does not invent new thresholds — P204 already encodes them.
 */
export function mapP204RecommendationToOutcome(
  recommendation: P204Recommendation,
): DecisionOutcome {
  switch (recommendation) {
    case "advance_paperwork_needed":
      return "auto_advance";
    case "reject":
      return "auto_reject";
    default:
      return "human_review";
  }
}

export function decideFromEvaluation(
  evaluation: CandidateEvaluation,
  opts?: {
    alreadySentOrActivePacket?: boolean;
    dataQualityScore?: number | null;
    dataQualityIssues?: string[];
    preferHumanReview?: boolean;
  },
): Decision {
  const generatedAt = new Date().toISOString();
  const dqScore = opts?.dataQualityScore ?? null;
  const dqIssues = opts?.dataQualityIssues ?? [];

  if (opts?.alreadySentOrActivePacket) {
    return {
      decisionId: randomUUID(),
      candidateId: evaluation.candidateId,
      evaluation,
      outcome: "human_review",
      p204Recommendation: evaluation.recommendation,
      confidence: evaluation.confidence / 100,
      humanApprovalRequired: true,
      automationReady: false,
      explanation: [
        "Live packet protection: already sent / active signature — do not resend",
        `Underlying P204 recommendation was ${evaluation.recommendation}`,
      ],
      nextAction: "Leave Paperwork Sent / Signed path untouched",
      generatedAt,
      dataQualityScore: dqScore,
      dataQualityIssues: dqIssues,
    };
  }

  let outcome = mapP204RecommendationToOutcome(evaluation.recommendation);
  const explanation = [
    `P204 recommendation=${evaluation.recommendation}`,
    `confidence=${evaluation.confidence}`,
    ...evaluation.evidence.slice(0, 6),
    ...evaluation.reasonCodes.slice(0, 6).map((c) => `reason:${c}`),
  ];

  // Soft data-quality gate: prefer human review instead of hard failure.
  if (opts?.preferHumanReview && outcome === "auto_advance") {
    outcome = "human_review";
    explanation.push(
      `Data-quality soft gate: score=${dqScore ?? "n/a"} — routed to human_review`,
      ...dqIssues.slice(0, 6).map((i) => `dq:${i}`),
    );
  } else if (dqIssues.length > 0) {
    explanation.push(...dqIssues.slice(0, 6).map((i) => `dq:${i}`));
  }

  return {
    decisionId: randomUUID(),
    candidateId: evaluation.candidateId,
    evaluation,
    outcome,
    p204Recommendation: evaluation.recommendation,
    confidence: evaluation.confidence / 100,
    humanApprovalRequired: outcome !== "auto_advance",
    automationReady: outcome === "auto_advance",
    explanation,
    nextAction: evaluation.recommendedNextAction,
    generatedAt,
    dataQualityScore: dqScore,
    dataQualityIssues: dqIssues,
  };
}
