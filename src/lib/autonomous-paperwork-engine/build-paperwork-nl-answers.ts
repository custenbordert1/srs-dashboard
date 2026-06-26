import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { buildAutonomousPaperworkDashboard } from "@/lib/autonomous-paperwork-engine/build-autonomous-paperwork-dashboard";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";

const P70_PAPERWORK_QUERY_IDS = new Set<ExecutiveQueryId>([
  "paperwork_auto_sent_today",
  "paperwork_manual_sent_today",
  "paperwork_failed_count",
  "paperwork_waiting_longest",
  "paperwork_top_recruiter_today",
  "paperwork_ready_for_auto",
]);

export function isP70PaperworkQueryId(queryId: ExecutiveQueryId): boolean {
  return P70_PAPERWORK_QUERY_IDS.has(queryId);
}

export function buildPaperworkNlAnswers(input: {
  queryId: ExecutiveQueryId;
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  fetchedAt: string;
}): ExecutiveQueryAnswer | null {
  if (!isP70PaperworkQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const dashboard = buildAutonomousPaperworkDashboard({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    fetchedAt: input.fetchedAt,
  });

  const sourceSystem = "Autonomous Paperwork Engine (preview)";

  switch (input.queryId) {
    case "paperwork_auto_sent_today": {
      const total = dashboard.todayActivity.autoSentToday;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { autoSent: total, manualSent: dashboard.todayActivity.manualSentToday },
        comparison: null,
        summary: `${total} paperwork packet${total === 1 ? "" : "s"} were automatically sent today.`,
      };
    }
    case "paperwork_manual_sent_today": {
      const total = dashboard.todayActivity.manualSentToday;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { manualSent: total, autoSent: dashboard.todayActivity.autoSentToday },
        comparison: null,
        summary: `${total} paperwork packet${total === 1 ? "" : "s"} were manually sent today.`,
      };
    }
    case "paperwork_failed_count": {
      const total = dashboard.todayActivity.failed;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { failed: total, failureRate: dashboard.executiveMetrics.failureRate ?? 0 },
        comparison: null,
        summary: `${total} paperwork packet${total === 1 ? "" : "s"} failed in the pipeline.`,
      };
    }
    case "paperwork_waiting_longest": {
      const longest = dashboard.waitingTooLong[0] ?? dashboard.candidateQueue.find(
        (row) => row.lifecycleStatus === "sent" || row.lifecycleStatus === "viewed",
      );
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: dashboard.waitingTooLong.length,
        metrics: { waitingOver48h: dashboard.executiveMetrics.pendingOver48Hours },
        comparison: null,
        summary: longest
          ? `${longest.candidateName} has waited the longest (${longest.elapsedLabel ?? "unknown"}).`
          : "No candidates are currently waiting on paperwork signatures.",
      };
    }
    case "paperwork_top_recruiter_today": {
      const top = dashboard.recruiterMetrics[0];
      const total = (top?.manualSends ?? 0) + (top?.autoSends ?? 0);
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: {
          manualSends: top?.manualSends ?? 0,
          autoSends: top?.autoSends ?? 0,
        },
        comparison: null,
        summary: top
          ? `${top.recruiter} sent the most paperwork today (${total} packet${total === 1 ? "" : "s"}).`
          : "No recruiters sent paperwork today.",
      };
    }
    case "paperwork_ready_for_auto": {
      const total = dashboard.automationReadiness.readyForAutoSend;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "paperwork",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: {
          ready: total,
          blocked: dashboard.automationReadiness.blocked,
        },
        comparison: null,
        summary: `${total} candidate${total === 1 ? "" : "s"} ready for automatic paperwork (preview).`,
      };
    }
    default:
      return null;
  }
}
