import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  HiringRecommendation,
  TerritoryCoverageNeed,
} from "@/lib/autonomous-recruiting-engine/types";
import type { AutopilotExecution } from "@/lib/autonomous-recruiting-execution/execution-store";
import type { AutopilotRecruiterTask } from "@/lib/autonomous-recruiting-execution/recruiter-task-store";
import { buildRecruiterTasks } from "@/lib/hiring-funnel-automation/build-recruiter-tasks";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dueDateFromPriority(priority: "high" | "medium" | "low", referenceMs: number): string {
  const days = priority === "high" ? 1 : priority === "medium" ? 2 : 4;
  return new Date(referenceMs + days * MS_PER_DAY).toISOString();
}

function mapHiringToTask(
  hire: HiringRecommendation,
  execution: AutopilotExecution | undefined,
  referenceMs: number,
): AutopilotRecruiterTask {
  const priority =
    hire.recommendedAction === "Hire Now"
      ? "high"
      : hire.recommendedAction === "Interview"
        ? "medium"
        : "low";

  return {
    id: `autopilot-hire-${hire.candidateId}`,
    label: `${hire.recommendedAction}: ${hire.candidateName}`,
    owner: "Recruiting",
    priority,
    dueDate: dueDateFromPriority(priority, referenceMs),
    status: "open",
    candidateId: hire.candidateId,
    territory: hire.territory,
    sourceExecutionId: execution?.id,
    createdAt: new Date(referenceMs).toISOString(),
    updatedAt: new Date(referenceMs).toISOString(),
  };
}

function mapCoverageToTask(
  coverage: TerritoryCoverageNeed,
  execution: AutopilotExecution | undefined,
  referenceMs: number,
): AutopilotRecruiterTask {
  return {
    id: `autopilot-coverage-${coverage.territoryKey}`,
    label: `Critical coverage: ${coverage.territoryLabel}`,
    owner: coverage.dmName || "Unassigned",
    priority: "high",
    dueDate: dueDateFromPriority("high", referenceMs),
    status: "open",
    territory: coverage.territoryLabel,
    sourceExecutionId: execution?.id,
    createdAt: new Date(referenceMs).toISOString(),
    updatedAt: new Date(referenceMs).toISOString(),
  };
}

function mapFunnelTaskToAutopilot(
  task: ReturnType<typeof buildRecruiterTasks>[number],
  referenceMs: number,
): AutopilotRecruiterTask {
  const priority = task.risk === "critical" ? "high" : task.risk === "warning" ? "medium" : "low";
  return {
    id: `autopilot-funnel-${task.id}`,
    label: task.label,
    owner: task.owner,
    priority,
    dueDate: dueDateFromPriority(priority, referenceMs),
    status: "open",
    candidateId: task.candidateId,
    territory: "Pipeline",
    createdAt: new Date(referenceMs).toISOString(),
    updatedAt: new Date(referenceMs).toISOString(),
  };
}

export function buildRecruiterExecutionTasks(input: {
  hiringRecommendations: HiringRecommendation[];
  coverageNeeds: TerritoryCoverageNeed[];
  scoredRows: ScoredCandidateWorkflowRow[];
  executions: AutopilotExecution[];
  referenceMs?: number;
}): AutopilotRecruiterTask[] {
  const referenceMs = input.referenceMs ?? Date.now();
  const executionByRecommendation = new Map(input.executions.map((row) => [row.recommendationId, row]));
  const tasks: AutopilotRecruiterTask[] = [];
  const seen = new Set<string>();

  for (const hire of input.hiringRecommendations) {
    if (hire.recommendedAction === "Reject") continue;
    const execution = executionByRecommendation.get(`hire-${hire.candidateId}`);
    const task = mapHiringToTask(hire, execution, referenceMs);
    if (!seen.has(task.id)) {
      tasks.push(task);
      seen.add(task.id);
    }
  }

  for (const coverage of input.coverageNeeds) {
    if (coverage.coverageStatus !== "Critical") continue;
    const execution = executionByRecommendation.get(`coverage-${coverage.territoryKey}`);
    const task = mapCoverageToTask(coverage, execution, referenceMs);
    if (!seen.has(task.id)) {
      tasks.push(task);
      seen.add(task.id);
    }
  }

  const funnelTasks = buildRecruiterTasks(input.scoredRows, { referenceMs });
  for (const funnelTask of funnelTasks.slice(0, 15)) {
    const task = mapFunnelTaskToAutopilot(funnelTask, referenceMs);
    if (!seen.has(task.id)) {
      tasks.push(task);
      seen.add(task.id);
    }
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return tasks.sort(
    (a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
}
