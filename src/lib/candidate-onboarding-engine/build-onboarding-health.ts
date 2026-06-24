import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkOperationsMetrics } from "@/lib/paperwork-operations-metrics";
import {
  countEligibleForPaperwork,
} from "@/lib/candidate-onboarding-engine/build-onboarding-decisions";
import {
  listCandidateOnboardingRecords,
  loadOnboardingRunSummary,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  loadCandidateOnboardingPolicy,
} from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import type { CandidateOnboardingHealth } from "@/lib/candidate-onboarding-engine/types";
import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate()
  );
}

export async function buildCandidateOnboardingHealth(input?: {
  candidates?: ScoredCandidateWorkflowRow[];
}): Promise<CandidateOnboardingHealth> {
  const [policy, records, lastRun] = await Promise.all([
    loadCandidateOnboardingPolicy(),
    listCandidateOnboardingRecords(500),
    loadOnboardingRunSummary(),
  ]);

  const candidates = input?.candidates ?? [];
  const ops = buildPaperworkOperationsMetrics(candidates);
  const eligibleForPaperwork =
    candidates.length > 0 ? countEligibleForPaperwork(candidates, policy) : lastRun?.eligibleForPaperwork ?? 0;

  const paperworkBlockedByGrade: Partial<Record<AiLetterGrade, number>> = {};
  for (const row of candidates) {
    if (!isGradeAllowedForPaperwork(row.aiGrade, policy.paperworkByGrade)) {
      paperworkBlockedByGrade[row.aiGrade] = (paperworkBlockedByGrade[row.aiGrade] ?? 0) + 1;
    }
  }

  const packetsPending = records.filter(
    (row) =>
      row.status === "sent" ||
      row.status === "viewed" ||
      row.status === "partially_completed" ||
      row.status === "pending_approval",
  ).length;
  const packetsSentToday = records.filter(
    (row) => row.sentAt && isToday(row.sentAt),
  ).length;
  const completed = records.filter(
    (row) => row.status === "completed" || row.status === "ready_for_mel",
  ).length;
  const readyForMelCount = records.filter((row) => row.readyForMel).length;
  const escalations = records.filter((row) => row.escalated).length;
  const completionRatePct =
    records.length > 0 ? Math.round((completed / records.length) * 100) : 100;

  return {
    eligibleForPaperwork,
    packetsPending,
    packetsSentToday: packetsSentToday || ops.signedToday,
    completionRatePct,
    averageCompletionHours: ops.avgTimeToSignHours,
    overduePackets: ops.pendingOver24h,
    escalations,
    readyForMelCount,
    policyEnabled: policy.enabled,
    policyMode: policy.mode,
    dryRun: policy.dryRun,
    executed: lastRun?.packetsSent ?? 0,
    blockedByPolicy: lastRun?.blockedByPolicy ?? 0,
    blockedByBatchCap: lastRun?.blockedByBatchCap ?? 0,
    lastRunAt: lastRun?.runAt ?? null,
    paperworkAllowedByGrade: policy.paperworkByGrade,
    paperworkBlockedByGrade,
  };
}
