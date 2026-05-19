import type { CandidateAiScore } from "@/lib/candidate-ai-scoring";

export type PrioritizedCandidate = {
  candidateId: string;
  name: string;
  positionName: string;
  workflowStatus: string;
  assignedRecruiter: string;
  appliedDate: string;
  aiGrade: string;
  numericScore: number;
  reason: string;
};

export type PrioritizationQueues = {
  newestQualified: PrioritizedCandidate[];
  agingApplied: PrioritizedCandidate[];
  recruiterAssigned: PrioritizedCandidate[];
  highAiScore: PrioritizedCandidate[];
};

type QueueInput = {
  candidateId: string;
  name: string;
  positionName: string;
  workflowStatus: string;
  assignedRecruiter: string;
  appliedDate: string;
  appliedDays: number | null;
  ai: CandidateAiScore;
};

function parseAppliedTime(raw: string): number {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toRow(candidate: QueueInput, reason: string): PrioritizedCandidate {
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    positionName: candidate.positionName,
    workflowStatus: candidate.workflowStatus,
    assignedRecruiter: candidate.assignedRecruiter,
    appliedDate: candidate.appliedDate,
    aiGrade: candidate.ai.letterGrade,
    numericScore: candidate.ai.numericScore,
    reason,
  };
}

export function buildPrioritizationQueues(candidates: QueueInput[]): PrioritizationQueues {
  const newestQualified = candidates
    .filter((candidate) => candidate.workflowStatus === "Qualified")
    .sort((a, b) => parseAppliedTime(b.appliedDate) - parseAppliedTime(a.appliedDate))
    .slice(0, 8)
    .map((candidate) => toRow(candidate, "Newest qualified applicant"));

  const agingApplied = candidates
    .filter((candidate) => candidate.workflowStatus === "Applied" || candidate.workflowStatus === "Needs Review")
    .sort((a, b) => (b.appliedDays ?? 0) - (a.appliedDays ?? 0))
    .slice(0, 8)
    .map((candidate) => toRow(candidate, `Applied ${candidate.appliedDays ?? "—"}d ago`));

  const recruiterAssigned = candidates
    .filter((candidate) => candidate.assignedRecruiter.trim() && candidate.assignedRecruiter !== "Unassigned")
    .sort((a, b) => b.ai.numericScore - a.ai.numericScore)
    .slice(0, 8)
    .map((candidate) => toRow(candidate, `Assigned to ${candidate.assignedRecruiter}`));

  const highAiScore = [...candidates]
    .sort((a, b) => b.ai.numericScore - a.ai.numericScore)
    .slice(0, 8)
    .map((candidate) => toRow(candidate, `AI score ${candidate.ai.numericScore}`));

  return { newestQualified, agingApplied, recruiterAssigned, highAiScore };
}
