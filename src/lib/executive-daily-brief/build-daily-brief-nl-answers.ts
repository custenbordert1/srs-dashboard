import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import { buildExecutiveDailyBrief } from "@/lib/executive-daily-brief/build-executive-daily-brief";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

const P72_BRIEF_QUERY_IDS = new Set<ExecutiveQueryId>([
  "brief_how_are_we_doing",
  "brief_recruiting_summary",
  "brief_what_changed",
  "brief_needs_attention",
]);

export function isP72BriefQueryId(queryId: ExecutiveQueryId): boolean {
  return P72_BRIEF_QUERY_IDS.has(queryId);
}

export function buildDailyBriefNlAnswer(input: {
  queryId: ExecutiveQueryId;
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt: string;
}): ExecutiveQueryAnswer | null {
  if (!isP72BriefQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const brief = buildExecutiveDailyBrief({
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

  const m = brief.metrics;
  let lead = brief.summaryText;

  switch (input.queryId) {
    case "brief_how_are_we_doing":
      lead = `${brief.greeting}. Today: ${m.applicantsToday} applicants, ${m.paperworkSentToday} paperwork sent, ${m.paperworkSignedToday} signed, ${m.pendingSignatures} pending signatures.`;
      break;
    case "brief_what_changed":
      lead = `Applicants ${m.applicantsDelta >= 0 ? "up" : "down"} ${Math.abs(m.applicantsDelta)} vs yesterday (${m.applicantsToday} today vs ${m.applicantsYesterday} yesterday). Paperwork sent today: ${m.paperworkSentToday}. Signed today: ${m.paperworkSignedToday}.`;
      break;
    case "brief_needs_attention":
      lead = `Needs attention: ${brief.risks.map((r) => `${r.count} ${r.label}`).join("; ")}. Human review queue: ${m.humanReviewCount}.`;
      break;
    default:
      break;
  }

  return {
    queryId: input.queryId,
    question: definition.question,
    category: "brief",
    previewMode: P69_PREVIEW_MODE,
    sourceSystem: "Executive Daily Brief (P72)",
    lastRefreshedAt: input.fetchedAt,
    total: m.applicantsToday,
    metrics: {
      applicantsToday: m.applicantsToday,
      paperworkSentToday: m.paperworkSentToday,
      paperworkSignedToday: m.paperworkSignedToday,
      pendingSignatures: m.pendingSignatures,
      readyForWorkToday: m.readyForWorkToday,
      humanReview: m.humanReviewCount,
    },
    comparison: null,
    summary: `${lead}\n\n${brief.summaryText}`,
  };
}
