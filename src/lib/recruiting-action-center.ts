import type {
  AutomationPriorityLevel,
  OpportunityAutomationRow,
} from "@/lib/opportunity-automation";

export type WorkflowStatus =
  | "New"
  | "Assigned"
  | "In Progress"
  | "Waiting"
  | "Completed"
  | "Escalated";

export type WorkflowActivityType = "status" | "assignment" | "note" | "snooze" | "escalation";

export type WorkflowActivity = {
  id: string;
  type: WorkflowActivityType;
  message: string;
  timestamp: string;
};

export type PersistedWorkflowState = {
  status: WorkflowStatus;
  recruiter: string;
  dm: string;
  snoozedUntil: string | null;
  notes: string[];
  activity: WorkflowActivity[];
};

export type WorkflowStateById = Record<string, PersistedWorkflowState>;

export type RecruitingActionWorkflow = OpportunityAutomationRow & {
  id: string;
  workflowStatus: WorkflowStatus;
  assignedRecruiter: string;
  assignedDm: string;
  snoozedUntil: string | null;
  notes: string[];
  activity: WorkflowActivity[];
};

export type RecruiterWorkloadRow = {
  recruiter: string;
  activeActions: number;
  completedToday: number;
  overdueActions: number;
  criticalActions: number;
};

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
  "New",
  "Assigned",
  "In Progress",
  "Waiting",
  "Completed",
  "Escalated",
];

export function workflowId(row: OpportunityAutomationRow): string {
  return [row.market, row.state, row.recommendedAction].join("|").toLowerCase();
}

function initialActivity(row: OpportunityAutomationRow): WorkflowActivity[] {
  return [
    {
      id: `${workflowId(row)}-created`,
      type: "status",
      message: `Created from automation recommendation: ${row.recommendedAction}.`,
      timestamp: new Date().toISOString(),
    },
  ];
}

export function mergeWorkflowState(
  rows: OpportunityAutomationRow[],
  stateById: WorkflowStateById,
): RecruitingActionWorkflow[] {
  return rows.map((row) => {
    const id = workflowId(row);
    const persisted = stateById[id];
    return {
      ...row,
      id,
      workflowStatus: persisted?.status ?? "New",
      assignedRecruiter: persisted?.recruiter ?? "",
      assignedDm: persisted?.dm ?? row.dm,
      snoozedUntil: persisted?.snoozedUntil ?? null,
      notes: persisted?.notes ?? [],
      activity: persisted?.activity?.length ? persisted.activity : initialActivity(row),
    };
  });
}

export function createWorkflowActivity(
  type: WorkflowActivityType,
  message: string,
): WorkflowActivity {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
  };
}

export function isCompletedToday(workflow: RecruitingActionWorkflow, now = new Date()): boolean {
  if (workflow.workflowStatus !== "Completed") return false;
  const completion = workflow.activity
    .filter((event) => event.type === "status" && event.message.includes("Completed"))
    .at(-1);
  if (!completion) return false;
  const completedAt = new Date(completion.timestamp);
  return (
    completedAt.getFullYear() === now.getFullYear() &&
    completedAt.getMonth() === now.getMonth() &&
    completedAt.getDate() === now.getDate()
  );
}

export function isWorkflowOverdue(workflow: RecruitingActionWorkflow, now = new Date()): boolean {
  if (workflow.workflowStatus === "Completed") return false;
  if (workflow.deadlineDays !== null && workflow.deadlineDays <= 0) return true;
  if (!workflow.snoozedUntil) return false;
  return new Date(workflow.snoozedUntil).getTime() < now.getTime();
}

export function isCriticalWorkflow(workflow: RecruitingActionWorkflow): boolean {
  return workflow.suggestedPriorityLevel === "Critical" || workflow.automationScore >= 80;
}

export function buildRecruiterWorkload(
  workflows: RecruitingActionWorkflow[],
): RecruiterWorkloadRow[] {
  const byRecruiter = new Map<string, RecruiterWorkloadRow>();

  for (const workflow of workflows) {
    const recruiter = workflow.assignedRecruiter || "Unassigned";
    const row = byRecruiter.get(recruiter) ?? {
      recruiter,
      activeActions: 0,
      completedToday: 0,
      overdueActions: 0,
      criticalActions: 0,
    };

    if (workflow.workflowStatus !== "Completed") row.activeActions += 1;
    if (isCompletedToday(workflow)) row.completedToday += 1;
    if (isWorkflowOverdue(workflow)) row.overdueActions += 1;
    if (workflow.workflowStatus !== "Completed" && isCriticalWorkflow(workflow)) {
      row.criticalActions += 1;
    }

    byRecruiter.set(recruiter, row);
  }

  return [...byRecruiter.values()].sort(
    (a, b) =>
      b.criticalActions - a.criticalActions ||
      b.overdueActions - a.overdueActions ||
      b.activeActions - a.activeActions ||
      a.recruiter.localeCompare(b.recruiter),
  );
}

export function workloadTotals(workloads: RecruiterWorkloadRow[]) {
  return workloads.reduce(
    (totals, row) => ({
      activeActions: totals.activeActions + row.activeActions,
      completedToday: totals.completedToday + row.completedToday,
      overdueActions: totals.overdueActions + row.overdueActions,
      criticalActions: totals.criticalActions + row.criticalActions,
    }),
    { activeActions: 0, completedToday: 0, overdueActions: 0, criticalActions: 0 },
  );
}

export const URGENCY_OPTIONS: AutomationPriorityLevel[] = ["Critical", "High", "Medium", "Low"];
