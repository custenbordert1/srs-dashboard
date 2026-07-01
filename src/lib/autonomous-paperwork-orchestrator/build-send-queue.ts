import { daysSince } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import type {
  OrchestratorCandidateRecord,
  PaperworkEligibilityStatus,
  SendQueueSnapshot,
} from "@/lib/autonomous-paperwork-orchestrator/types";
import { P123_AVERAGE_SEND_MINUTES } from "@/lib/autonomous-paperwork-orchestrator/types";

function projectDeadlineScore(status: PaperworkEligibilityStatus): number {
  if (status === "READY_TO_SEND") return 90;
  if (status === "READY_AFTER_APPROVAL") return 75;
  return 10;
}

function computePriorityScore(candidate: OrchestratorCandidateRecord): number {
  let score = 0;
  score += candidate.projectDeadlineScore * 4;
  score += Math.min(candidate.candidateAgeDays, 30) * 2;
  score += candidate.coverageImpact * 3;
  score += candidate.mappingConfidence * 0.2;
  score += candidate.manualPriorityOverride * 100;
  if (candidate.eligibilityStatus === "READY_TO_SEND") score += 25;
  if (candidate.eligibilityStatus === "READY_AFTER_APPROVAL") score += 15;
  if (candidate.duplicateRisk) score -= 100;
  return Math.round(score);
}

export function buildOrchestratorCandidateRecord(input: {
  candidateId: string;
  candidateName: string;
  email: string;
  positionId: string | null;
  positionTitle: string | null;
  recruiter: string | null;
  dm: string | null;
  eligibilityStatus: PaperworkEligibilityStatus;
  requiredAction: string;
  blockingReasons: string[];
  templateKey: string | null;
  mappingConfidence: number;
  approvedMappingReady: boolean;
  onPilotAllowlist: boolean;
  approvedForQueue: boolean;
  createdAt?: string | null;
  manualPriorityOverride?: number;
}): OrchestratorCandidateRecord {
  const candidateAgeDays = daysSince(input.createdAt);
  const duplicateRisk = input.eligibilityStatus === "DUPLICATE";
  const coverageImpact =
    input.eligibilityStatus === "READY_TO_SEND" ? 80 : input.approvedMappingReady ? 65 : 20;
  const record: OrchestratorCandidateRecord = {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    email: input.email,
    positionId: input.positionId,
    positionTitle: input.positionTitle,
    recruiter: input.recruiter,
    dm: input.dm,
    eligibilityStatus: input.eligibilityStatus,
    requiredAction: input.requiredAction,
    blockingReasons: input.blockingReasons,
    templateKey: input.templateKey,
    mappingConfidence: input.mappingConfidence,
    coverageImpact,
    duplicateRisk,
    manualPriorityOverride: input.manualPriorityOverride ?? 0,
    candidateAgeDays,
    projectDeadlineScore: projectDeadlineScore(input.eligibilityStatus),
    priorityScore: 0,
    approvedMappingReady: input.approvedMappingReady,
    onPilotAllowlist: input.onPilotAllowlist,
    safeToSend: input.approvedForQueue && !duplicateRisk,
  };
  record.priorityScore = computePriorityScore(record);
  return record;
}

export function buildSendQueue(candidates: OrchestratorCandidateRecord[]): SendQueueSnapshot {
  const queue = candidates
    .filter((candidate) => candidate.safeToSend)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const remainingQueue = queue;
  const nextCandidate = queue[0] ?? null;
  const nextFive = queue.slice(0, 5);
  const estimatedCompletionMinutes = remainingQueue.length * P123_AVERAGE_SEND_MINUTES;

  return {
    nextCandidate,
    nextFive,
    remainingQueue,
    queueDepth: remainingQueue.length,
    estimatedCompletionMinutes,
  };
}

export function compareQueuePriority(a: OrchestratorCandidateRecord, b: OrchestratorCandidateRecord): number {
  return a.priorityScore - b.priorityScore;
}
