import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import { buildExecutiveDailyBrief } from "@/lib/executive-daily-brief/build-executive-daily-brief";
import type { ExecutiveDailyBriefPreviewResult } from "@/lib/executive-daily-brief/types";
import { P72_PREVIEW_MODE } from "@/lib/executive-daily-brief/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

/**
 * Read-only cross-engine brief — no production writes, sends, or mutations.
 */
export function runExecutiveDailyBriefPreview(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
}): ExecutiveDailyBriefPreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const brief = buildExecutiveDailyBrief({ ...input, fetchedAt });

  const warnings = [
    "Preview mode — read-only cross-engine summary, no production writes.",
    "P71 live paperwork execution remains disabled unless all production flags are enabled.",
    "No Dropbox Sign calls, live emails, or candidate mutations from this brief.",
  ];

  if (!input.opportunities?.length) {
    warnings.push("Workforce market metrics omitted — MEL data unavailable.");
  }

  return {
    ok: true,
    previewMode: P72_PREVIEW_MODE,
    fetchedAt,
    brief,
    warnings,
  };
}
