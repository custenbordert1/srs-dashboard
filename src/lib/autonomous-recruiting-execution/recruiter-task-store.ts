import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STORE_DIR = path.join(process.cwd(), ".data");
const TASKS_PATH = path.join(STORE_DIR, "autopilot-recruiter-tasks.json");

export type RecruiterTaskStatus = "open" | "completed" | "escalated";

export type AutopilotRecruiterTask = {
  id: string;
  label: string;
  owner: string;
  priority: "high" | "medium" | "low";
  dueDate: string;
  status: RecruiterTaskStatus;
  candidateId?: string;
  territory: string;
  sourceExecutionId?: string;
  createdAt: string;
  updatedAt: string;
};

type RecruiterTaskStoreFile = {
  tasks: AutopilotRecruiterTask[];
  updatedAt: string;
};

async function readTasksFile(): Promise<RecruiterTaskStoreFile> {
  try {
    const raw = await readFile(TASKS_PATH, "utf8");
    const parsed = JSON.parse(raw) as RecruiterTaskStoreFile;
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { tasks: [], updatedAt: new Date().toISOString() };
  }
}

async function writeTasksFile(file: RecruiterTaskStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(TASKS_PATH, JSON.stringify(file, null, 2), "utf8");
}

export async function listRecruiterTasks(): Promise<AutopilotRecruiterTask[]> {
  return (await readTasksFile()).tasks.sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
}

export async function getRecruiterTask(id: string): Promise<AutopilotRecruiterTask | null> {
  return (await readTasksFile()).tasks.find((task) => task.id === id) ?? null;
}

export async function upsertRecruiterTasks(
  incoming: Omit<AutopilotRecruiterTask, "createdAt" | "updatedAt">[],
): Promise<AutopilotRecruiterTask[]> {
  const file = await readTasksFile();
  const now = new Date().toISOString();
  const byId = new Map(file.tasks.map((task) => [task.id, task]));

  for (const task of incoming) {
    const existing = byId.get(task.id);
    if (existing) {
      if (existing.status === "completed") continue;
      byId.set(task.id, { ...existing, ...task, updatedAt: now });
    } else {
      byId.set(task.id, { ...task, createdAt: now, updatedAt: now });
    }
  }

  file.tasks = [...byId.values()].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
  file.updatedAt = now;
  await writeTasksFile(file);
  return file.tasks;
}

async function updateTask(
  id: string,
  patch: Partial<AutopilotRecruiterTask>,
): Promise<AutopilotRecruiterTask | null> {
  const file = await readTasksFile();
  const index = file.tasks.findIndex((task) => task.id === id);
  if (index < 0) return null;
  const updated: AutopilotRecruiterTask = {
    ...file.tasks[index]!,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  file.tasks[index] = updated;
  file.updatedAt = updated.updatedAt;
  await writeTasksFile(file);
  return updated;
}

export async function completeTask(id: string): Promise<AutopilotRecruiterTask | null> {
  const task = await getRecruiterTask(id);
  if (!task || task.status === "completed") return null;
  return updateTask(id, { status: "completed" });
}

export async function reassignTask(
  id: string,
  owner: string,
): Promise<AutopilotRecruiterTask | null> {
  const task = await getRecruiterTask(id);
  if (!task) return null;
  return updateTask(id, { owner: owner.trim() || "Unassigned" });
}

export async function escalateTask(id: string): Promise<AutopilotRecruiterTask | null> {
  const task = await getRecruiterTask(id);
  if (!task || task.status === "completed") return null;
  return updateTask(id, { status: "escalated", priority: "high" });
}

export async function createRecruiterTask(
  input: Omit<AutopilotRecruiterTask, "id" | "createdAt" | "updatedAt" | "status"> & {
    id?: string;
    status?: RecruiterTaskStatus;
  },
): Promise<AutopilotRecruiterTask> {
  const now = new Date().toISOString();
  const task: AutopilotRecruiterTask = {
    id: input.id ?? randomUUID(),
    label: input.label,
    owner: input.owner,
    priority: input.priority,
    dueDate: input.dueDate,
    status: input.status ?? "open",
    candidateId: input.candidateId,
    territory: input.territory,
    sourceExecutionId: input.sourceExecutionId,
    createdAt: now,
    updatedAt: now,
  };
  const file = await readTasksFile();
  const existingIndex = file.tasks.findIndex((row) => row.id === task.id);
  if (existingIndex >= 0) {
    file.tasks[existingIndex] = { ...file.tasks[existingIndex]!, ...task, createdAt: file.tasks[existingIndex]!.createdAt };
  } else {
    file.tasks.unshift(task);
  }
  file.updatedAt = now;
  await writeTasksFile(file);
  return task;
}
