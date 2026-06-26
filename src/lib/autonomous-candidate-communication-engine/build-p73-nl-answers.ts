import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildAutonomousCandidateCommunicationDashboard } from "@/lib/autonomous-candidate-communication-engine/build-communication-dashboard";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";

const P73_COMMUNICATION_QUERY_IDS = new Set<ExecutiveQueryId>([
  "communication_sent_today",
  "communication_needs_reminders",
  "communication_no_response",
  "communication_failures",
  "communication_welcome_today",
  "communication_waiting_approval",
]);

export function isP73CommunicationQueryId(queryId: ExecutiveQueryId): boolean {
  return P73_COMMUNICATION_QUERY_IDS.has(queryId);
}

export function buildP73NlAnswers(input: {
  queryId: ExecutiveQueryId;
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P73FeatureFlags;
  fetchedAt: string;
}): ExecutiveQueryAnswer | null {
  if (!isP73CommunicationQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const dashboard = buildAutonomousCandidateCommunicationDashboard({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.flags,
    fetchedAt: input.fetchedAt,
  });

  const sourceSystem = "Autonomous Candidate Communication Engine (P73)";
  const health = dashboard.health;
  const queue = dashboard.queue;

  switch (input.queryId) {
    case "communication_sent_today": {
      const total = health.previewSent + health.communicationsToday;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "communication",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { previewSent: health.previewSent, today: health.communicationsToday },
        comparison: null,
        summary: `${health.previewSent} preview communication${health.previewSent === 1 ? "" : "s"} sent today (${health.communicationsToday} scheduled today).`,
      };
    }
    case "communication_needs_reminders": {
      const reminderTypes = new Set(["reminder_24h", "reminder_48h", "final_reminder"]);
      const waiting = queue.filter(
        (item) =>
          reminderTypes.has(item.communicationType) &&
          (item.status === "queued" || item.status === "ready" || item.status === "waiting_approval"),
      );
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "communication",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: waiting.length,
        metrics: { reminders: waiting.length, queued: health.queued },
        comparison: null,
        summary:
          waiting.length > 0
            ? `${waiting.length} candidate${waiting.length === 1 ? "" : "s"} still need paperwork reminders.`
            : "No candidates currently need reminders.",
      };
    }
    case "communication_no_response": {
      const noResponse = input.candidates.filter(
        (row) => row.paperworkSentAt && !row.paperworkSignedAt,
      );
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "communication",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: noResponse.length,
        metrics: { pending: noResponse.length },
        comparison: null,
        summary: `${noResponse.length} candidate${noResponse.length === 1 ? " has" : "s have"} not responded to paperwork.`,
      };
    }
    case "communication_failures": {
      const failed = queue.filter((item) => item.status === "failed");
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "communication",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: failed.length,
        metrics: { failures: health.failures },
        comparison: null,
        summary:
          failed.length > 0
            ? `${failed.length} communication failure${failed.length === 1 ? "" : "s"} in preview queue.`
            : "No communication failures in preview.",
      };
    }
    case "communication_welcome_today": {
      const welcome = queue.filter(
        (item) => item.communicationType === "welcome_email" && item.status === "sent_preview",
      );
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "communication",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: welcome.length,
        metrics: { welcome: welcome.length },
        comparison: null,
        summary:
          welcome.length > 0
            ? `${welcome.length} welcome email${welcome.length === 1 ? "" : "s"} preview-sent today.`
            : "No welcome emails preview-sent today.",
      };
    }
    case "communication_waiting_approval": {
      const waiting = queue.filter((item) => item.status === "waiting_approval");
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "communication",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: waiting.length,
        metrics: { waitingApproval: health.waitingApproval },
        comparison: null,
        summary: `${waiting.length} communication${waiting.length === 1 ? "" : "s"} waiting recruiter approval.`,
      };
    }
    default:
      return null;
  }
}
