import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isMelReadyStatus } from "@/lib/candidate-action-sla";
import type { AdActionRecommendation } from "@/lib/hiring-automation-engine/types";

export type JobPipelineContext = {
  positionId: string;
  breezyJobId?: string;
  title: string;
  city: string;
  state: string;
  pipelineStatus?: string;
  qualifiedCount: number;
  readyForMelCount: number;
  activeRepCount: number;
};

export function buildJobPipelineContext(
  jobs: Array<{
    positionId: string;
    breezyJobId?: string;
    title: string;
    city: string;
    state: string;
    pipelineStatus?: string;
  }>,
  candidates: ScoredCandidateWorkflowRow[],
): JobPipelineContext[] {
  return jobs.map((job) => {
    const forJob = candidates.filter((c) => c.positionId === job.positionId);
    const qualifiedCount = forJob.filter(
      (c) =>
        c.candidateGrade.grade === "A" ||
        c.candidateGrade.grade === "B" ||
        c.workflowStatus === "Qualified",
    ).length;
    const readyForMelCount = forJob.filter((c) => isMelReadyStatus(c.workflowStatus)).length;
    const activeRepCount = forJob.filter(
      (c) => c.workflowStatus === "Active Rep" || c.workflowStatus === "Loaded in MEL",
    ).length;

    return {
      positionId: job.positionId,
      breezyJobId: job.breezyJobId,
      title: job.title,
      city: job.city,
      state: job.state,
      pipelineStatus: job.pipelineStatus,
      qualifiedCount,
      readyForMelCount,
      activeRepCount,
    };
  });
}

export function recommendAdActions(contexts: JobPipelineContext[]): AdActionRecommendation[] {
  const recommendations: AdActionRecommendation[] = [];

  for (const ctx of contexts) {
    if (ctx.qualifiedCount >= 3 || ctx.readyForMelCount >= 1) {
      const reasons: string[] = [];
      if (ctx.qualifiedCount >= 3) reasons.push(`${ctx.qualifiedCount} qualified candidates in pipeline`);
      if (ctx.readyForMelCount >= 1) reasons.push(`${ctx.readyForMelCount} Ready for MEL`);
      if (ctx.activeRepCount > 0) reasons.push(`${ctx.activeRepCount} active reps`);

      recommendations.push({
        type: "close-pause-ad",
        breezyJobId: ctx.breezyJobId,
        positionId: ctx.positionId,
        title: ctx.title,
        reason: reasons.join("; "),
        dataUsed: [
          `qualifiedCount: ${ctx.qualifiedCount}`,
          `readyForMelCount: ${ctx.readyForMelCount}`,
          `activeRepCount: ${ctx.activeRepCount}`,
        ],
        expectedOutcome: "Pause or close Breezy ad after approval to avoid over-hiring.",
        requiresApproval: true,
      });
    }

    if (ctx.qualifiedCount === 0 && ctx.readyForMelCount === 0 && ctx.pipelineStatus !== "closed") {
      recommendations.push({
        type: "create-new-ad",
        breezyJobId: ctx.breezyJobId,
        positionId: ctx.positionId,
        title: ctx.title,
        reason: "Coverage gap — no qualified candidates in pipeline.",
        dataUsed: [`positionId: ${ctx.positionId}`, `city: ${ctx.city}, ${ctx.state}`],
        expectedOutcome: "New Breezy post draft created for approval.",
        requiresApproval: true,
        suggestedCity: ctx.city,
        suggestedTitle: ctx.title,
        suggestedPriority: "high",
        nearbyLocations: [ctx.city, ctx.state].filter(Boolean),
      });
    }
  }

  return recommendations;
}
