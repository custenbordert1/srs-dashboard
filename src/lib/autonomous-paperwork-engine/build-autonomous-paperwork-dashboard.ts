import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import {
  buildPaperworkAutomationReadiness,
  buildPaperworkCandidateQueue,
  buildPaperworkExecutiveMetrics,
  buildRecruiterPaperworkMetrics,
} from "@/lib/autonomous-paperwork-engine/build-paperwork-queue-intelligence";
import { buildPaperworkTodayActivity } from "@/lib/autonomous-paperwork-engine/build-today-activity";
import type { AutonomousPaperworkDashboardSnapshot } from "@/lib/autonomous-paperwork-engine/types";
import { P70_PREVIEW_MODE, P70_SOURCE_PHASE } from "@/lib/autonomous-paperwork-engine/types";

const WAITING_TOO_LONG_HOURS = 48;

export function buildAutonomousPaperworkDashboard(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  fetchedAt?: string;
}): AutonomousPaperworkDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const todayActivity = buildPaperworkTodayActivity({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    referenceMs,
  });

  const candidateQueue = buildPaperworkCandidateQueue({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    referenceMs,
  });

  const recruiterMetrics = buildRecruiterPaperworkMetrics({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    fetchedAt,
  });

  const automationReadiness = buildPaperworkAutomationReadiness({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
  });

  const executiveMetrics = buildPaperworkExecutiveMetrics({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    todayActivity,
    fetchedAt,
  });

  const waitingTooLong = candidateQueue.filter(
    (row) =>
      (row.lifecycleStatus === "sent" || row.lifecycleStatus === "viewed") &&
      (row.elapsedHours ?? 0) >= WAITING_TOO_LONG_HOURS,
  );

  const failedPackets = candidateQueue.filter((row) => row.lifecycleStatus === "failed");

  return {
    previewMode: P70_PREVIEW_MODE,
    sourcePhase: P70_SOURCE_PHASE,
    fetchedAt,
    todayActivity,
    recruiterMetrics,
    candidateQueue: candidateQueue.slice(0, 50),
    automationReadiness,
    executiveMetrics,
    waitingTooLong: waitingTooLong.slice(0, 15),
    failedPackets: failedPackets.slice(0, 15),
  };
}
