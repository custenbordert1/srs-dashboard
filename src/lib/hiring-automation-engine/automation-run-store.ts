import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AutomationAuditEntry,
  AutomationRun,
  AutomationRunStatus,
  AutomationType,
  ControlCenterSnapshot,
} from "@/lib/hiring-automation-engine/types";

const STORE_DIR = path.join(process.cwd(), ".data");
const RUNS_PATH = path.join(STORE_DIR, "hiring-automation-runs.json");

type AutomationRunStoreFile = {
  runs: AutomationRun[];
  updatedAt: string;
};

async function readRunsFile(): Promise<AutomationRunStoreFile> {
  try {
    const raw = await readFile(RUNS_PATH, "utf8");
    const parsed = JSON.parse(raw) as AutomationRunStoreFile;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { runs: [], updatedAt: new Date().toISOString() };
  }
}

async function writeRunsFile(file: AutomationRunStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(RUNS_PATH, JSON.stringify(file, null, 2), "utf8");
}

function audit(action: string, detail: string, actor?: string): AutomationAuditEntry {
  return { id: randomUUID(), at: new Date().toISOString(), action, actor, detail };
}

export async function listAutomationRuns(): Promise<AutomationRun[]> {
  return (await readRunsFile()).runs.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getAutomationRun(id: string): Promise<AutomationRun | null> {
  return (await readRunsFile()).runs.find((run) => run.id === id) ?? null;
}

export async function findPendingRun(
  candidateId: string,
  type: AutomationType,
): Promise<AutomationRun | null> {
  return (
    (await readRunsFile()).runs.find(
      (run) =>
        run.candidateId === candidateId &&
        run.type === type &&
        (run.status === "pending" || run.status === "approved"),
    ) ?? null
  );
}

export async function findPendingAdRun(
  positionId: string,
  type: AutomationType,
): Promise<AutomationRun | null> {
  return (
    (await readRunsFile()).runs.find(
      (run) =>
        run.positionId === positionId &&
        !run.candidateId &&
        run.type === type &&
        (run.status === "pending" || run.status === "approved"),
    ) ?? null
  );
}

export async function createAutomationRun(input: {
  type: AutomationType;
  candidateId?: string;
  positionId?: string;
  breezyJobId?: string;
  reason: string;
  dataUsed: string[];
  expectedOutcome: string;
  undoPath: string;
  requiresApproval: boolean;
  payload?: Record<string, string>;
  actor?: string;
}): Promise<AutomationRun> {
  const now = new Date().toISOString();
  const run: AutomationRun = {
    id: randomUUID(),
    type: input.type,
    status: input.requiresApproval ? "pending" : "approved",
    candidateId: input.candidateId,
    positionId: input.positionId,
    breezyJobId: input.breezyJobId,
    reason: input.reason,
    dataUsed: input.dataUsed,
    expectedOutcome: input.expectedOutcome,
    undoPath: input.undoPath,
    requiresApproval: input.requiresApproval,
    createdAt: now,
    updatedAt: now,
    approvedAt: input.requiresApproval ? undefined : now,
    payload: input.payload,
    auditTrail: [
      audit("created", `Automation planned: ${input.type}`, input.actor),
    ],
  };

  const file = await readRunsFile();
  file.runs.unshift(run);
  file.updatedAt = now;
  await writeRunsFile(file);
  return run;
}

async function updateRun(
  id: string,
  patch: Partial<AutomationRun> & { audit: AutomationAuditEntry },
): Promise<AutomationRun | null> {
  const file = await readRunsFile();
  const index = file.runs.findIndex((run) => run.id === id);
  if (index < 0) return null;

  const now = new Date().toISOString();
  const existing = file.runs[index]!;
  const updated: AutomationRun = {
    ...existing,
    ...patch,
    updatedAt: now,
    auditTrail: [...existing.auditTrail, patch.audit],
  };
  file.runs[index] = updated;
  file.updatedAt = now;
  await writeRunsFile(file);
  return updated;
}

export async function approveAutomationRun(id: string, actor?: string): Promise<AutomationRun | null> {
  const run = await getAutomationRun(id);
  if (!run || run.status !== "pending") return null;
  return updateRun(id, {
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: actor,
    audit: audit("approved", "Automation approved for execution.", actor),
  });
}

export async function rejectAutomationRun(id: string, actor?: string): Promise<AutomationRun | null> {
  const run = await getAutomationRun(id);
  if (!run || run.status !== "pending") return null;
  return updateRun(id, {
    status: "rejected",
    rejectedAt: new Date().toISOString(),
    rejectedBy: actor,
    audit: audit("rejected", "Automation rejected.", actor),
  });
}

export async function markAutomationExecuted(
  id: string,
  resultSummary: string,
  actor?: string,
): Promise<AutomationRun | null> {
  const run = await getAutomationRun(id);
  if (!run || (run.status !== "approved" && run.status !== "pending")) return null;
  return updateRun(id, {
    status: "executed",
    executedAt: new Date().toISOString(),
    executedBy: actor,
    resultSummary,
    audit: audit("executed", resultSummary, actor),
  });
}

export async function markAutomationFailed(
  id: string,
  failureReason: string,
  actor?: string,
): Promise<AutomationRun | null> {
  const run = await getAutomationRun(id);
  if (!run) return null;
  return updateRun(id, {
    status: "failed",
    failureReason,
    audit: audit("failed", failureReason, actor),
  });
}

export function buildControlCenterSnapshot(runs: AutomationRun[]): ControlCenterSnapshot {
  const byStatus = (status: AutomationRunStatus) =>
    runs.filter((run) => run.status === status);

  return {
    pending: byStatus("pending"),
    approved: byStatus("approved"),
    executed: byStatus("executed"),
    failed: byStatus("failed"),
    rejected: byStatus("rejected"),
    generatedAt: new Date().toISOString(),
  };
}
