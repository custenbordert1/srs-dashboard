import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildP71NlAnswers, isP71PaperworkQueryId } from "@/lib/autonomous-paperwork-execution-engine/build-p71-nl-answers";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import { buildP73NlAnswers, isP73CommunicationQueryId } from "@/lib/autonomous-candidate-communication-engine/build-p73-nl-answers";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import { DEFAULT_P73_FEATURE_FLAGS } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { buildP74NlAnswers, isP74OrchestratorQueryId } from "@/lib/autonomous-recruiting-orchestrator/build-p74-nl-answers";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import { DEFAULT_P74_FEATURE_FLAGS } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { buildDailyBriefNlAnswer, isP72BriefQueryId } from "@/lib/executive-daily-brief/build-daily-brief-nl-answers";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
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

async function buildAnswerForQueryId(input: {
  queryId: ExecutiveQueryId;
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  p73Flags?: P73FeatureFlags;
  p74Flags?: P74FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt: string;
}): Promise<ExecutiveQueryAnswer> {
  const p73Flags = input.p73Flags ?? {
    ...DEFAULT_P73_FEATURE_FLAGS,
    communicationEnabled: true,
    executionMode: "preview",
  };
  const p74Flags = input.p74Flags ?? {
    ...DEFAULT_P74_FEATURE_FLAGS,
    orchestratorEnabled: true,
    executionMode: "preview",
  };

  if (input.queryId.startsWith("applicants_")) {
    return buildApplicantQueryAnswer({
      queryId: input.queryId as Extract<ExecutiveQueryId, `applicants_${string}`>,
      candidates: input.candidates,
      fetchedAt: input.fetchedAt,
    });
  }

  if (isP72BriefQueryId(input.queryId)) {
    const briefAnswer = buildDailyBriefNlAnswer({
      queryId: input.queryId,
      candidates: input.candidates,
      workflowRows: input.workflowRows,
      onboardingRecords: input.onboardingRecords,
      policy: input.policy,
      flags: input.flags,
      sendQueueMetrics: input.sendQueueMetrics,
      opportunities: input.opportunities,
      activeReps: input.activeReps,
      fetchedAt: input.fetchedAt,
    });
    if (briefAnswer) return briefAnswer;
  }

  if (isP71PaperworkQueryId(input.queryId)) {
    const p71Answer = await buildP71NlAnswers({
      queryId: input.queryId,
      candidates: input.workflowRows,
      onboardingRecords: input.onboardingRecords,
      policy: input.policy,
      flags: input.flags,
      sendQueueMetrics: input.sendQueueMetrics,
      fetchedAt: input.fetchedAt,
    });
    if (p71Answer) return p71Answer;
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

  if (isP73CommunicationQueryId(input.queryId)) {
    const p73Answer = buildP73NlAnswers({
      queryId: input.queryId,
      candidates: input.workflowRows,
      onboardingRecords: input.onboardingRecords,
      policy: input.policy,
      flags: p73Flags,
      fetchedAt: input.fetchedAt,
    });
    if (p73Answer) return p73Answer;
  }

  if (isP74OrchestratorQueryId(input.queryId)) {
    const p74Answer = buildP74NlAnswers({
      queryId: input.queryId,
      candidates: input.candidates,
      workflowRows: input.workflowRows,
      onboardingRecords: input.onboardingRecords,
      policy: input.policy,
      p71Flags: input.flags,
      p73Flags,
      p74Flags,
      sendQueueMetrics: input.sendQueueMetrics,
      opportunities: input.opportunities,
      activeReps: input.activeReps,
      fetchedAt: input.fetchedAt,
    });
    if (p74Answer) return p74Answer;
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

export async function buildExecutiveQueryDashboardSnapshot(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  p73Flags?: P73FeatureFlags;
  p74Flags?: P74FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
}): Promise<ExecutiveQueryDashboardSnapshot> {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const cards = buildExecutiveQueryCards({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    fetchedAt,
  });

  const recentAnswers = await Promise.all(
    listSupportedExecutiveQueries().map((definition) =>
      buildAnswerForQueryId({
        queryId: definition.id,
        candidates: input.candidates,
        workflowRows: input.workflowRows,
        onboardingRecords: input.onboardingRecords,
        policy: input.policy,
        flags: input.flags,
        p73Flags: input.p73Flags ?? {
          ...DEFAULT_P73_FEATURE_FLAGS,
          communicationEnabled: true,
          executionMode: "preview",
        },
        p74Flags: input.p74Flags ?? {
          ...DEFAULT_P74_FEATURE_FLAGS,
          orchestratorEnabled: true,
          executionMode: "preview",
        },
        sendQueueMetrics: input.sendQueueMetrics,
        opportunities: input.opportunities,
        activeReps: input.activeReps,
        fetchedAt,
      }),
    ),
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
export async function runExecutiveQueryPreview(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  p73Flags?: P73FeatureFlags;
  p74Flags?: P74FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  question?: string | null;
  fetchedAt?: string;
}): Promise<ExecutiveQueryPreviewResult> {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = await buildExecutiveQueryDashboardSnapshot({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
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
      answer = await buildAnswerForQueryId({
        queryId,
        candidates: input.candidates,
        workflowRows: input.workflowRows,
        onboardingRecords: input.onboardingRecords,
        policy: input.policy,
        flags: input.flags,
        p73Flags: input.p73Flags ?? {
          ...DEFAULT_P73_FEATURE_FLAGS,
          communicationEnabled: true,
          executionMode: "preview",
        },
        p74Flags: input.p74Flags ?? {
          ...DEFAULT_P74_FEATURE_FLAGS,
          orchestratorEnabled: true,
          executionMode: "preview",
        },
        sendQueueMetrics: input.sendQueueMetrics,
        opportunities: input.opportunities,
        activeReps: input.activeReps,
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
