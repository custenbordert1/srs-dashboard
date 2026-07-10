import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

export function clonePaperworkContext(context: LoadedPaperworkCandidates): LoadedPaperworkCandidates {
  const rowsByCandidateId = new Map<string, ScoredCandidateWorkflowRow>();
  for (const [id, row] of context.rowsByCandidateId) {
    rowsByCandidateId.set(id, {
      ...row,
      candidateGrade: row.candidateGrade ? { ...row.candidateGrade } : row.candidateGrade,
    });
  }

  return {
    rowsByCandidateId,
    jobsByPositionId: new Map(context.jobsByPositionId),
    closedJobsByPositionId: new Map(context.closedJobsByPositionId),
    publishedJobs: [...context.publishedJobs],
    publishedJobTitleById: new Map(context.publishedJobTitleById),
    onboardingByCandidateId: new Map(context.onboardingByCandidateId),
    p109ByCandidate: new Map(context.p109ByCandidate),
    approvedMappingsByCandidate: new Map(context.approvedMappingsByCandidate),
    p100SentIds: new Set(context.p100SentIds),
    pilotSentIds: new Set(context.pilotSentIds),
    candidateIds: [...context.candidateIds],
  };
}
