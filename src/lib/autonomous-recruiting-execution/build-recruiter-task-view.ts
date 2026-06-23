import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildRecruiterTasks } from "@/lib/hiring-funnel-automation/build-recruiter-tasks";
import type { RecruiterTask } from "@/lib/hiring-funnel-automation/types";

export type RecruiterTaskView = RecruiterTask;

export function buildRecruiterTaskView(input: {
  scoredRows: ScoredCandidateWorkflowRow[];
  referenceMs?: number;
  actingRecruiter?: string;
}): RecruiterTaskView[] {
  return buildRecruiterTasks(input.scoredRows, {
    referenceMs: input.referenceMs,
    actingRecruiter: input.actingRecruiter,
  });
}
