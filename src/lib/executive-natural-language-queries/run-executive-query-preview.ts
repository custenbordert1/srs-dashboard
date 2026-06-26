import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkNlAnswers, isP70PaperworkQueryId } from "@/lib/autonomous-paperwork-engine/build-paperwork-nl-answers";
import {
  buildApplicantQueryAnswer,
  buildExecutiveQueryCards,
  buildPaperworkQueryAnswer,
} from "@/lib/executive-natural-language-queries/build-query-answers";
import { listSupportedExecutiveQueries } from "@/lib/executive-natural-language-queries/query-registry";
import { resolveExecutiveQueryId } from "@/lib/executive-natural-language-queries/resolve-executive-query";
import type {
  ExecutiveQueryAnswer,
  ExecutiveQueryDashboardSnapshot,
  ExecutiveQueryId,
  ExecutiveQueryPreviewResult,
} from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE, P69_SOURCE_PHASE } from "@/lib/executive-natural-language-queries/types";

function buildAnswerForQueryId(input: {
  queryId: ExecutiveQueryId;
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  fetchedAt: string;
}): ExecutiveQueryAnswer {
  if (input.queryId.startsWith("applicants_")) {
    return buildApplicantQueryAnswer({
      queryId: input.queryId as Extract<ExecutiveQueryId, `applicants_${string}`>,
      candidates: input.candidates,
      fetchedAt: input.fetchedAt,
    });
  }

  if (isP70PaperworkQueryId(input.queryId)) {
    const p70Answer = buildPaperworkNlAnswers({
      queryId: input.queryId,
      candidates: input.workflowRows,
      onboardingRecords: input.onboardingRecords,
      policy: input.policy,
      fetchedAt: input.fetchedAt,
    });
    if (p70Answer) return p70Answer;
  }

  return buildPaperworkQueryAnswer({
    queryId: input.queryId as Extract<
      ExecutiveQueryId,
      "paperwork_sent_today" | "paperwork_sent_week" | "paperwork_signed_today"
    >,
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    fetchedAt: input.fetchedAt,
  });
}

export function buildExecutiveQueryDashboardSnapshot(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  fetchedAt?: string;
}): ExecutiveQueryDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const cards = buildExecutiveQueryCards({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    fetchedAt,
  });

  const recentAnswers: ExecutiveQueryAnswer[] = listSupportedExecutiveQueries().map((definition) =>
    buildAnswerForQueryId({
      queryId: definition.id,
      candidates: input.candidates,
      workflowRows: input.workflowRows,
      onboardingRecords: input.onboardingRecords,
      policy: input.policy,
      fetchedAt,
    }),
  );

  return {
    previewMode: P69_PREVIEW_MODE,
    sourcePhase: P69_SOURCE_PHASE,
    fetchedAt,
    cards,
    supportedQuestions: listSupportedExecutiveQueries(),
    recentAnswers,
  };
}

/**
 * Read-only preview runner — never writes workflow, onboarding, or external systems.
 */
export function runExecutiveQueryPreview(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  question?: string | null;
  fetchedAt?: string;
}): ExecutiveQueryPreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildExecutiveQueryDashboardSnapshot({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    fetchedAt,
  });

  const warnings = [
    "Preview mode — read-only operational answers, no automation or production writes.",
    "Answers are computed from ingested Breezy cache and workflow snapshots.",
  ];

  let answer: ExecutiveQueryAnswer | null = null;
  if (input.question?.trim()) {
    const queryId = resolveExecutiveQueryId(input.question);
    if (queryId) {
      answer = buildAnswerForQueryId({
        queryId,
        candidates: input.candidates,
        workflowRows: input.workflowRows,
        onboardingRecords: input.onboardingRecords,
        policy: input.policy,
        fetchedAt,
      });
    } else {
      warnings.push(`Could not match question to a supported query: "${input.question.trim()}"`);
    }
  }

  return {
    ok: true,
    previewMode: P69_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    answer,
    warnings,
  };
}
