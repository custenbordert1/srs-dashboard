import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkExecutionEligibility } from "@/lib/autonomous-paperwork-execution-engine/build-execution-eligibility";
import { runPreExecutionSafetyChecks } from "@/lib/autonomous-paperwork-execution-engine/execution-safety-checks";
import { canExecutePaperwork } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import type {
  P71FeatureFlags,
  PaperworkExecutionQueueItem,
  PaperworkExecutionQueueStatus,
} from "@/lib/autonomous-paperwork-execution-engine/types";
import { ONBOARDING_TEMPLATE_REGISTRY } from "@/lib/onboarding-template-registry";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function mapOnboardingToQueueStatus(
  onboarding: CandidateOnboardingRecord | null,
  row: ScoredCandidateWorkflowRow,
): PaperworkExecutionQueueStatus {
  const stage = classifyPaperworkStage({ row, onboarding });
  if (onboarding?.status === "sending") return "sending";
  if (onboarding?.status === "queued" || onboarding?.status === "retry_scheduled") return "queued";
  if (onboarding?.status === "failed") return "failed";
  if (onboarding?.status === "declined") return "cancelled";
  if (stage === "signed") return "completed";
  if (stage === "sent" || stage === "viewed") return "waiting_signature";
  if (stage === "failed") return "failed";
  return "queued";
}

export function buildPaperworkExecutionQueue(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  maxRetries: number;
  referenceMs?: number;
}): PaperworkExecutionQueueItem[] {
  const referenceMs = input.referenceMs ?? Date.now();
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  return input.candidates
    .map((row) => {
      const onboarding = onboardingByCandidate.get(row.candidateId) ?? null;
      const eligibility = buildPaperworkExecutionEligibility({
        row,
        onboarding,
        policy: input.policy,
        flags: input.flags,
      });

      const safety = runPreExecutionSafetyChecks({
        row,
        onboarding,
        policy: input.policy,
        flags: input.flags,
      });

      const inPipeline =
        eligibility.eligible ||
        onboarding != null ||
        row.actionType === "send-paperwork" ||
        row.actionType === "await-signature" ||
        classifyPaperworkStage({ row, onboarding }) != null;

      if (!inPipeline) return null;

      const templateKey = eligibility.templateKey ?? "onboarding_packet";
      const templateLabel = ONBOARDING_TEMPLATE_REGISTRY[templateKey].label;
      const status = mapOnboardingToQueueStatus(onboarding, row);
      const wouldExecute =
        eligibility.eligible &&
        safety.safe &&
        (input.flags.executionMode === "preview" ||
          input.flags.executionMode === "pilot" ||
          canExecutePaperwork(input.flags));

      return {
        queueId: onboarding?.onboardingId ?? `queue-${row.candidateId}`,
        candidateId: row.candidateId,
        candidateName: candidateName(row),
        recruiter: row.assignedRecruiter?.trim() || "Unassigned",
        districtManager: row.assignedDM?.trim() || null,
        market: row.city?.trim() || null,
        state: row.state?.trim() || null,
        client: row.positionName?.trim() || null,
        project: row.positionName?.trim() || null,
        templateKey,
        templateLabel,
        createdAt: onboarding?.createdAt ?? row.actionGeneratedAt ?? new Date(referenceMs).toISOString(),
        scheduledAt: onboarding?.statusHistory.find((entry) => entry.status === "queued")?.at ?? null,
        executionAt: onboarding?.sentAt ?? row.paperworkSentAt ?? null,
        attempts: onboarding?.retryCount ?? 0,
        maxAttempts: input.maxRetries,
        executionMode: input.flags.executionMode,
        effectiveMode: eligibility.effectiveExecutionMode,
        status,
        blockingReasons: eligibility.blockingReasons,
        wouldExecute: eligibility.eligible && (wouldExecute || input.flags.executionMode === "preview"),
      };
    })
    .filter((row): row is PaperworkExecutionQueueItem => row != null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
