import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { evaluateCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation/evaluate-candidate-automation";
import type { RecruiterTask } from "@/lib/hiring-funnel-automation/types";

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function candidatesHref(candidateId: string, queue?: string): string {
  const params = new URLSearchParams({ tab: "candidates", candidateId });
  if (queue) params.set("queue", queue);
  return `/?${params.toString()}`;
}

function queueForTask(type: RecruiterTask["type"]): string | undefined {
  switch (type) {
    case "interview-needed":
      return "interview-needed";
    case "paperwork-follow-up":
      return "paperwork-pending";
    case "ready-for-mel-review":
      return "ready-mel";
    case "recruiter-outreach":
      return "needs-review";
    case "assign-recruiter":
      return "unassigned";
    default:
      return undefined;
  }
}

export function buildRecruiterTasks(
  candidates: ScoredCandidateWorkflowRow[],
  options?: { actingRecruiter?: string; referenceMs?: number },
): RecruiterTask[] {
  const referenceMs = options?.referenceMs ?? Date.now();
  const acting = options?.actingRecruiter?.trim() ?? "";
  const tasks: RecruiterTask[] = [];

  for (const row of candidates) {
    const automation = evaluateCandidateFunnelAutomation(row, referenceMs);
    if (!automation.taskType || !automation.taskLabel) continue;

    const owner = row.assignedRecruiter.trim();
    if (acting && !isUnassignedRecruiter(owner) && owner !== acting) continue;

    tasks.push({
      id: `${row.candidateId}:${automation.taskType}`,
      candidateId: row.candidateId,
      candidateName: candidateName(row),
      type: automation.taskType,
      label: automation.taskLabel,
      owner: owner || "Unassigned",
      risk: automation.risk,
      href: candidatesHref(row.candidateId, queueForTask(automation.taskType)),
    });
  }

  const riskOrder: Record<RecruiterTask["risk"], number> = { critical: 0, warning: 1, healthy: 2 };
  return tasks.sort(
    (a, b) => riskOrder[a.risk] - riskOrder[b.risk] || a.label.localeCompare(b.label),
  );
}
