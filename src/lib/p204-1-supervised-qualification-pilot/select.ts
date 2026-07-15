import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildEmailDuplicateIndex,
  evaluateP204Qualification,
} from "@/lib/p204-ai-candidate-qualification";
import type { P204QualificationDecision } from "@/lib/p204-ai-candidate-qualification/types";
import {
  hasActivePaperwork,
  hasExistingP2041Recommendation,
  stageBlocked,
  toRecommendationLabel,
} from "@/lib/p204-1-supervised-qualification-pilot/evidence";
import {
  P204_1_ADVANCE_CONFIDENCE_THRESHOLD,
  P204_1_ADVANCE_SLOTS,
  P204_1_REJECT_SLOTS,
  P204_1_REVIEW_SLOTS,
  type P2041RecommendationLabel,
} from "@/lib/p204-1-supervised-qualification-pilot/types";

export type P2041EligibleCandidate = {
  candidate: BreezyCandidate;
  workflow: CandidateWorkflowRecord;
  decision: P204QualificationDecision;
  label: P2041RecommendationLabel;
};

export type P2041SelectionResult = {
  eligible: P2041EligibleCandidate[];
  selected: P2041EligibleCandidate[];
  skipped: Array<{ candidateId: string; reason: string }>;
  preflight: {
    appliedScanned: number;
    eligibleAdvance: number;
    eligibleReview: number;
    eligibleReject: number;
    selectedAdvance: number;
    selectedReview: number;
    selectedReject: number;
  };
};

function diversifyByState<T extends { candidate: BreezyCandidate }>(
  items: T[],
  limit: number,
): T[] {
  const byState = new Map<string, T[]>();
  for (const item of items) {
    const state = (item.candidate.state ?? "??").trim().toUpperCase() || "??";
    const list = byState.get(state) ?? [];
    list.push(item);
    byState.set(state, list);
  }
  const picked: T[] = [];
  const queues = [...byState.values()].map((list) => [...list]);
  while (picked.length < limit && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      if (picked.length >= limit) break;
      const next = q.shift();
      if (next) picked.push(next);
    }
  }
  return picked;
}

export function selectP2041PilotCohort(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
}): P2041SelectionResult {
  const emailCounts = buildEmailDuplicateIndex(input.candidates);
  const skipped: Array<{ candidateId: string; reason: string }> = [];
  const eligible: P2041EligibleCandidate[] = [];
  let appliedScanned = 0;

  for (const candidate of input.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    if (!workflow || workflow.workflowStatus !== "Applied") continue;
    appliedScanned += 1;

    if (!candidate.candidateId?.trim()) {
      skipped.push({ candidateId: "(blank)", reason: "invalid_candidate_id" });
      continue;
    }
    if (hasExistingP2041Recommendation(workflow)) {
      skipped.push({ candidateId: candidate.candidateId, reason: "existing_recommendation_audit" });
      continue;
    }
    if (hasActivePaperwork(workflow)) {
      skipped.push({ candidateId: candidate.candidateId, reason: "active_paperwork" });
      continue;
    }
    if (stageBlocked(candidate.stage) || stageBlocked(workflow.workflowStatus)) {
      skipped.push({ candidateId: candidate.candidateId, reason: "withdrawn_archived_or_held" });
      continue;
    }

    const row = buildScoredWorkflowRow(candidate, workflow, { job: null });
    const decision = evaluateP204Qualification({ row, emailCounts });
    const label = toRecommendationLabel(decision.recommendation);

    if (decision.components.duplicateSuspect) {
      skipped.push({ candidateId: candidate.candidateId, reason: "duplicate_conflict" });
      continue;
    }
    if (label === "Advance") {
      if (decision.confidence < P204_1_ADVANCE_CONFIDENCE_THRESHOLD) {
        skipped.push({ candidateId: candidate.candidateId, reason: "below_advance_threshold" });
        continue;
      }
      const hasQ =
        Boolean(candidate.hasQuestionnaire) || (candidate.questionnaireAnswers?.length ?? 0) >= 4;
      if (!hasQ) {
        skipped.push({
          candidateId: candidate.candidateId,
          reason: "advance_missing_questionnaire",
        });
        continue;
      }
    }

    eligible.push({ candidate, workflow, decision, label });
  }

  const advancePool = diversifyByState(
    eligible
      .filter((e) => e.label === "Advance")
      .sort((a, b) => b.decision.confidence - a.decision.confidence),
    P204_1_ADVANCE_SLOTS,
  );
  const reviewPool = diversifyByState(
    eligible
      .filter((e) => e.label === "Needs Recruiter Review")
      .sort((a, b) => b.decision.confidence - a.decision.confidence),
    P204_1_REVIEW_SLOTS,
  );
  const rejectPool = diversifyByState(
    eligible
      .filter((e) => e.label === "Reject")
      .sort((a, b) => b.decision.confidence - a.decision.confidence),
    P204_1_REJECT_SLOTS,
  );

  const selected = [...advancePool, ...reviewPool, ...rejectPool];

  return {
    eligible,
    selected,
    skipped,
    preflight: {
      appliedScanned,
      eligibleAdvance: eligible.filter((e) => e.label === "Advance").length,
      eligibleReview: eligible.filter((e) => e.label === "Needs Recruiter Review").length,
      eligibleReject: eligible.filter((e) => e.label === "Reject").length,
      selectedAdvance: advancePool.length,
      selectedReview: reviewPool.length,
      selectedReject: rejectPool.length,
    },
  };
}
