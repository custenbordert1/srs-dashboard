import type { BreezyJob } from "@/lib/breezy-api";
import type { AutonomousPaperworkCandidateResult } from "@/lib/p106-autonomous-paperwork-engine/types";
import { resolveClosedAdProjectMapping } from "@/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping";
import type { BlockedJobRecoveryReport } from "@/lib/closed-ad-project-mapping/types";
import { P106_3_SOURCE_PHASE } from "@/lib/closed-ad-project-mapping/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

const LEGACY_JOB_BLOCKERS = new Set([
  "unpublished_job",
  "closed_job",
  "project_not_mappable",
  "project_mapping_review",
]);

export function buildBlockedJobRecoveryReport(input: {
  candidates: AutonomousPaperworkCandidateResult[];
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
  storeCandidates: Record<string, { city?: string; state?: string; positionName?: string }>;
}): BlockedJobRecoveryReport {
  const groups = new Map<string, BlockedJobRecoveryReport["groups"][number]>();
  let recoveredByMappingCount = 0;
  let wouldSendAfterMappingCount = 0;

  for (const candidate of input.candidates) {
    if (candidate.category === "sent") continue;

    if (candidate.category === "ready_to_send" && candidate.positionId) {
      const row = input.rowsByCandidateId.get(candidate.candidateId);
      if (
        row &&
        input.closedJobsByPositionId.has(candidate.positionId) &&
        !input.jobsByPositionId.has(candidate.positionId)
      ) {
        const ingested = input.storeCandidates[candidate.candidateId];
        const mapping = resolveClosedAdProjectMapping({
          row,
          positionTitle: candidate.positionTitle,
          candidateCity: ingested?.city,
          candidateState: ingested?.state,
          jobsByPositionId: input.jobsByPositionId,
          closedJobsByPositionId: input.closedJobsByPositionId,
          publishedJobs: input.publishedJobs,
        });
        if (mapping.status === "closed_ad_mapped_project") {
          recoveredByMappingCount += 1;
          wouldSendAfterMappingCount += 1;
        }
      }
      continue;
    }

    if (!candidate.positionId || !LEGACY_JOB_BLOCKERS.has(candidate.blockerCategory ?? "")) {
      continue;
    }

    const row = input.rowsByCandidateId.get(candidate.candidateId);
    if (!row) continue;

    const ingested = input.storeCandidates[candidate.candidateId];
    const mapping = resolveClosedAdProjectMapping({
      row,
      positionTitle: candidate.positionTitle,
      candidateCity: ingested?.city,
      candidateState: ingested?.state,
      jobsByPositionId: input.jobsByPositionId,
      closedJobsByPositionId: input.closedJobsByPositionId,
      publishedJobs: input.publishedJobs,
    });

    if (mapping.status === "closed_ad_mapped_project") {
      recoveredByMappingCount += 1;
      if (candidate.p84Eligible || candidate.workflowStatus === "Paperwork Needed") {
        wouldSendAfterMappingCount += 1;
      }
    }

    const closedJob = input.closedJobsByPositionId.get(candidate.positionId);
    const key = candidate.positionId;
    const existing = groups.get(key);
    if (existing) {
      existing.candidateCount += 1;
      existing.candidateIds.push(candidate.candidateId);
    } else {
      groups.set(key, {
        positionId: candidate.positionId,
        jobTitle: candidate.positionTitle ?? closedJob?.name ?? "Unknown",
        city: closedJob?.city ?? ingested?.city ?? "",
        state: closedJob?.state ?? ingested?.state ?? "",
        breezyStatus: closedJob?.status ?? "unpublished",
        candidateCount: 1,
        candidateIds: [candidate.candidateId],
        mappingStatus: mapping.status,
        recommendedAction:
          mapping.status === "closed_ad_mapped_project"
            ? "Continue autonomous paperwork — project mapped."
            : mapping.status === "project_mapping_review"
              ? "Recruiter review mapping before send."
              : "Confirm active project exists or republish equivalent position.",
      });
    }
  }

  const blocked = input.candidates.filter(
    (c) => c.category === "blocked" && LEGACY_JOB_BLOCKERS.has(c.blockerCategory ?? ""),
  );

  return {
    sourcePhase: P106_3_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    totalBlockedCandidates: blocked.length,
    recoveredByMappingCount,
    wouldSendAfterMappingCount,
    groups: [...groups.values()].sort((a, b) => b.candidateCount - a.candidateCount),
  };
}
