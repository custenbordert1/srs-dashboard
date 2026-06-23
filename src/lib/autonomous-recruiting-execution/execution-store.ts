import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type {
  ExecutionAuditEntry,
  ExecutionOutcome,
  ExecutionPayload,
  ExecutionStatus,
  RecommendationType,
} from "@/lib/autonomous-recruiting-execution/types";

const STORE_DIR = path.join(process.cwd(), ".data");
const EXECUTIONS_PATH = path.join(STORE_DIR, "autopilot-executions.json");

export type AutopilotExecution = {
  id: string;
  recommendationId: string;
  territory: string;
  type: RecommendationType;
  priority: "high" | "medium" | "low";
  createdAt: string;
  approvedBy?: string;
  status: ExecutionStatus;
  completedAt?: string;
  outcome?: ExecutionOutcome;
  outcomeNotes?: string;
  payload: ExecutionPayload;
  auditTrail: ExecutionAuditEntry[];
  linkedJobDraftId?: string;
  linkedAutomationRunId?: string;
};

type ExecutionStoreFile = {
  executions: AutopilotExecution[];
  updatedAt: string;
};

async function readExecutionsFile(): Promise<ExecutionStoreFile> {
  try {
    const raw = await readFile(EXECUTIONS_PATH, "utf8");
    const parsed = JSON.parse(raw) as ExecutionStoreFile;
    return {
      executions: Array.isArray(parsed.executions) ? parsed.executions : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { executions: [], updatedAt: new Date().toISOString() };
  }
}

async function writeExecutionsFile(file: ExecutionStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(EXECUTIONS_PATH, JSON.stringify(file, null, 2), "utf8");
}

function audit(action: string, detail: string, actor?: string): ExecutionAuditEntry {
  return { id: randomUUID(), at: new Date().toISOString(), action, actor, detail };
}

export async function listExecutions(): Promise<AutopilotExecution[]> {
  return (await readExecutionsFile()).executions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getExecution(id: string): Promise<AutopilotExecution | null> {
  return (await readExecutionsFile()).executions.find((row) => row.id === id) ?? null;
}

function postingPriority(ad: { priority: "high" | "medium" | "low" }): "high" | "medium" | "low" {
  return ad.priority;
}

function initialStatus(
  approvalStatus?: "pending" | "approved" | "auto-approved",
): ExecutionStatus {
  if (approvalStatus === "approved" || approvalStatus === "auto-approved") return "recommended";
  return "detected";
}

export async function planExecutionsFromSnapshot(
  snapshot: AutonomousRecruitingSnapshot,
): Promise<AutopilotExecution[]> {
  const file = await readExecutionsFile();
  const existingByRecommendation = new Map(
    file.executions
      .filter((row) => row.status !== "archived")
      .map((row) => [row.recommendationId, row]),
  );
  const now = new Date().toISOString();
  let changed = false;

  const planned: AutopilotExecution[] = [];

  for (const ad of snapshot.postingRecommendations) {
    const recommendationId = ad.id;
    const existing = existingByRecommendation.get(recommendationId);
    if (existing) {
      planned.push(existing);
      continue;
    }

    const execution: AutopilotExecution = {
      id: randomUUID(),
      recommendationId,
      territory: ad.territory,
      type: "posting",
      priority: postingPriority(ad),
      createdAt: now,
      status: initialStatus(ad.approvalStatus),
      payload: {
        title: ad.title,
        adType: ad.adType,
        city: ad.city,
        state: ad.state,
        breezyJobId: ad.breezyJobId,
        positionId: ad.positionId,
        reason: ad.reason,
        refreshCount: ad.adType === "refresh-ad" ? 1 : 0,
      },
      auditTrail: [audit("detected", `Posting recommendation planned: ${ad.title}`)],
    };
    file.executions.unshift(execution);
    existingByRecommendation.set(recommendationId, execution);
    planned.push(execution);
    changed = true;
  }

  for (const hire of snapshot.hiringRecommendations) {
    if (hire.recommendedAction === "Reject") continue;

    const recommendationId = `hire-${hire.candidateId}`;
    const existing = existingByRecommendation.get(recommendationId);
    if (existing) {
      planned.push(existing);
      continue;
    }

    const priority =
      hire.recommendedAction === "Hire Now"
        ? "high"
        : hire.recommendedAction === "Interview"
          ? "medium"
          : "low";

    const execution: AutopilotExecution = {
      id: randomUUID(),
      recommendationId,
      territory: hire.territory,
      type: "hiring",
      priority,
      createdAt: now,
      status: "detected",
      payload: {
        candidateId: hire.candidateId,
        candidateName: hire.candidateName,
        hiringAction: hire.recommendedAction,
        reason: hire.reasons.join("; "),
      },
      auditTrail: [
        audit("detected", `Hiring recommendation: ${hire.recommendedAction} for ${hire.candidateName}`),
      ],
    };
    file.executions.unshift(execution);
    existingByRecommendation.set(recommendationId, execution);
    planned.push(execution);
    changed = true;
  }

  for (const coverage of snapshot.coverageNeeds) {
    if (coverage.coverageStatus !== "Critical") continue;

    const recommendationId = `coverage-${coverage.territoryKey}`;
    const existing = existingByRecommendation.get(recommendationId);
    if (existing) {
      planned.push(existing);
      continue;
    }

    const execution: AutopilotExecution = {
      id: randomUUID(),
      recommendationId,
      territory: coverage.territoryLabel,
      type: "coverage",
      priority: "high",
      createdAt: now,
      status: "detected",
      payload: {
        coverageStatus: coverage.coverageStatus,
        reason: coverage.recommendedAction,
      },
      auditTrail: [audit("detected", `Critical coverage need: ${coverage.territoryLabel}`)],
    };
    file.executions.unshift(execution);
    existingByRecommendation.set(recommendationId, execution);
    planned.push(execution);
    changed = true;
  }

  if (changed) {
    file.updatedAt = now;
    await writeExecutionsFile(file);
  }

  return planned.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function updateExecution(
  id: string,
  patch: Partial<AutopilotExecution> & { audit: ExecutionAuditEntry },
): Promise<AutopilotExecution | null> {
  const file = await readExecutionsFile();
  const index = file.executions.findIndex((row) => row.id === id);
  if (index < 0) return null;

  const existing = file.executions[index]!;
  const updated: AutopilotExecution = {
    ...existing,
    ...patch,
    auditTrail: [...existing.auditTrail, patch.audit],
  };
  file.executions[index] = updated;
  file.updatedAt = new Date().toISOString();
  await writeExecutionsFile(file);
  return updated;
}

export async function appendAudit(
  id: string,
  action: string,
  detail: string,
  actor?: string,
): Promise<AutopilotExecution | null> {
  return updateExecution(id, { audit: audit(action, detail, actor) });
}

export async function approveExecution(
  id: string,
  actor?: string,
): Promise<AutopilotExecution | null> {
  const row = await getExecution(id);
  if (!row || !["detected", "recommended"].includes(row.status)) return null;
  return updateExecution(id, {
    status: "approved",
    approvedBy: actor,
    audit: audit("approved", "Execution approved for orchestration.", actor),
  });
}

export async function startExecution(
  id: string,
  actor?: string,
): Promise<AutopilotExecution | null> {
  const row = await getExecution(id);
  if (!row || row.status !== "approved") return null;
  return updateExecution(id, {
    status: "executing",
    audit: audit("executing", "Execution started.", actor),
  });
}

export async function completeExecution(
  id: string,
  outcome: ExecutionOutcome,
  actor?: string,
  notes?: string,
): Promise<AutopilotExecution | null> {
  const row = await getExecution(id);
  if (!row || !["approved", "executing"].includes(row.status)) return null;
  return updateExecution(id, {
    status: "completed",
    completedAt: new Date().toISOString(),
    outcome,
    outcomeNotes: notes,
    linkedJobDraftId: outcome.linkedResourceType === "job-draft" ? outcome.linkedResourceId : row.linkedJobDraftId,
    linkedAutomationRunId:
      outcome.linkedResourceType === "automation-run" ? outcome.linkedResourceId : row.linkedAutomationRunId,
    audit: audit("completed", outcome.summary, actor),
  });
}

export async function failExecution(
  id: string,
  reason: string,
  actor?: string,
): Promise<AutopilotExecution | null> {
  const row = await getExecution(id);
  if (!row || ["completed", "archived"].includes(row.status)) return null;
  return updateExecution(id, {
    status: "failed",
    outcome: { summary: reason, success: false },
    audit: audit("failed", reason, actor),
  });
}

export async function archiveExecution(
  id: string,
  actor?: string,
): Promise<AutopilotExecution | null> {
  const row = await getExecution(id);
  if (!row) return null;
  return updateExecution(id, {
    status: "archived",
    audit: audit("archived", "Execution archived.", actor),
  });
}

export async function linkExecutionResources(
  id: string,
  links: { linkedJobDraftId?: string; linkedAutomationRunId?: string },
): Promise<AutopilotExecution | null> {
  const file = await readExecutionsFile();
  const index = file.executions.findIndex((row) => row.id === id);
  if (index < 0) return null;
  file.executions[index] = { ...file.executions[index]!, ...links };
  file.updatedAt = new Date().toISOString();
  await writeExecutionsFile(file);
  return file.executions[index]!;
}
