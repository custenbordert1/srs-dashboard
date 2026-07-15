import { createHash } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P204QualificationDecision } from "@/lib/p204-ai-candidate-qualification/types";
import {
  P204_1_NOTE_MARKER,
  type P2041RecommendationLabel,
} from "@/lib/p204-1-supervised-qualification-pilot/types";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function questionnaireEvidenceHash(candidate: BreezyCandidate): string {
  const answers = (candidate.questionnaireAnswers ?? [])
    .map((a) => `${a.question}|${a.answer}`)
    .sort()
    .join("\n");
  return hashText(`q:${candidate.candidateId}:${answers}`);
}

export function resumeEvidenceHash(candidate: BreezyCandidate): string {
  return hashText(`r:${candidate.candidateId}:${(candidate.resumeText ?? "").trim()}`);
}

export function compositeEvidenceHash(input: {
  candidateId: string;
  questionnaireHash: string;
  resumeHash: string;
  recommendation: string;
  confidence: number;
  workflowVersion: number;
}): string {
  return hashText(
    [
      input.candidateId,
      input.questionnaireHash,
      input.resumeHash,
      input.recommendation,
      String(input.confidence),
      String(input.workflowVersion),
    ].join("|"),
  );
}

export function toRecommendationLabel(
  rec: P204QualificationDecision["recommendation"],
): P2041RecommendationLabel {
  if (rec === "advance_paperwork_needed") return "Advance";
  if (rec === "reject") return "Reject";
  return "Needs Recruiter Review";
}

export function hasExistingP2041Recommendation(
  workflow: CandidateWorkflowRecord | undefined,
): boolean {
  if (!workflow) return false;
  const notes = workflow.notes ?? [];
  const history = workflow.history ?? [];
  if (notes.some((n) => n.includes(P204_1_NOTE_MARKER))) return true;
  if (history.some((h) => (h.message ?? "").includes(P204_1_NOTE_MARKER))) return true;
  return false;
}

export function stageBlocked(stage: string | null | undefined): boolean {
  return /withdraw|archiv|hold|disqual|reject|hired|active rep/i.test(stage ?? "");
}

export function hasActivePaperwork(workflow: CandidateWorkflowRecord | undefined): boolean {
  if (!workflow) return false;
  if (workflow.signatureRequestId) return true;
  if (workflow.paperworkStatus && workflow.paperworkStatus !== "not_sent") return true;
  if (
    workflow.workflowStatus === "Paperwork Needed" ||
    workflow.workflowStatus === "Paperwork Sent" ||
    workflow.workflowStatus === "Signed"
  ) {
    return true;
  }
  return false;
}

export function buildRecruiterExplanation(input: {
  recommendation: P2041RecommendationLabel;
  confidence: number;
  decision: P204QualificationDecision;
}): string {
  const positives = input.decision.evidence.filter((e) =>
    /score=|Qualified|nearby|Availability|strong/i.test(e),
  );
  const negatives = input.decision.reasonCodes.filter((c) =>
    /missing|duplicate|fraud|disqualify|low_|borderline|weak|insufficient/i.test(c),
  );
  const pos = positives.slice(0, 2).join("; ") || "limited positive signals";
  const neg = negatives.slice(0, 2).join(", ") || "none critical";
  return `${input.recommendation} @ ${input.confidence}% — positives: ${pos}. Watchouts: ${neg}.`;
}

export function splitFactors(decision: P204QualificationDecision): {
  positiveFactors: string[];
  negativeFactors: string[];
  hardGates: string[];
} {
  const hardGates = decision.reasonCodes.filter((c) =>
    /explicit_disqualify|invalid_contact|fraud_spam/.test(c),
  );
  const negativeFactors = decision.reasonCodes.filter((c) =>
    /missing|duplicate|low_|borderline|weak|insufficient|historical|hard_gate|not_qualified|request_more/i.test(
      c,
    ),
  );
  const positiveFactors = decision.reasonCodes.filter(
    (c) =>
      /strong_|qualified|nearby|territory|available_|high_qualification|calibrated_qualified|p193_qualified/.test(
        c,
      ),
  );
  return {
    positiveFactors: [...new Set(positiveFactors)],
    negativeFactors: [...new Set(negativeFactors)],
    hardGates: [...new Set(hardGates)],
  };
}
