import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildAutonomousPaperworkExecutionDashboard } from "@/lib/autonomous-paperwork-execution-engine/build-paperwork-execution-dashboard";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";
import { isP70PaperworkQueryId, buildPaperworkNlAnswers } from "@/lib/autonomous-paperwork-engine/build-paperwork-nl-answers";

const P71_PAPERWORK_QUERY_IDS = new Set<ExecutiveQueryId>([
  "paperwork_waiting_signature",
  "paperwork_blocked_auto",
  "paperwork_oldest_pending",
  "paperwork_failed_today",
]);

export function isP71PaperworkQueryId(queryId: ExecutiveQueryId): boolean {
  return P71_PAPERWORK_QUERY_IDS.has(queryId);
}

export async function buildP71NlAnswers(input: {
  queryId: ExecutiveQueryId;
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  fetchedAt: string;
}): Promise<ExecutiveQueryAnswer | null> {
  if (isP70PaperworkQueryId(input.queryId)) {
    return buildPaperworkNlAnswers({
      queryId: input.queryId,
      candidates: input.candidates,
      onboardingRecords: input.onboardingRecords,
      policy: input.policy,
      fetchedAt: input.fetchedAt,
    });
  }

  if (!isP71PaperworkQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const dashboard = await buildAutonomousPaperworkExecutionDashboard({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.flags,
    sendQueueMetrics: input.sendQueueMetrics,
    fetchedAt: input.fetchedAt,
  });

  const sourceSystem = "Autonomous Paperwork Execution Engine (P71)";
  const metrics = dashboard.executiveMetrics;

  switch (input.queryId) {
    case "paperwork_waiting_signature": {
      const total = metrics.waitingSignature;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { waiting: total, queueDepth: metrics.queueDepth },
        comparison: null,
        summary: `${total} candidate${total === 1 ? "" : "s"} waiting for signatures.`,
      };
    }
    case "paperwork_blocked_auto": {
      const total = dashboard.blockedCandidates.length;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { blocked: total, ready: dashboard.readyCandidates.length },
        comparison: null,
        summary: `${total} candidate${total === 1 ? "" : "s"} blocked from automatic paperwork.`,
      };
    }
    case "paperwork_oldest_pending": {
      const oldest = dashboard.executionQueue.find(
        (row) => row.status === "waiting_signature" || row.status === "sent",
      );
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.oldestWaitingPacketAt ? 1 : 0,
        metrics: { queueDepth: metrics.queueDepth },
        comparison: null,
        summary: metrics.oldestWaitingPacketAt
          ? `Oldest pending packet: ${oldest?.candidateName ?? "unknown"} since ${metrics.oldestWaitingPacketAt}.`
          : "No pending paperwork packets in the queue.",
      };
    }
    case "paperwork_failed_today": {
      const total = metrics.failedToday;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { failed: total, failureRate: metrics.failureRate ?? 0 },
        comparison: null,
        summary:
          total > 0
            ? `${total} paperwork packet${total === 1 ? "" : "s"} failed today.`
            : "No paperwork failures recorded today.",
      };
    }
    default:
      return null;
  }
}
