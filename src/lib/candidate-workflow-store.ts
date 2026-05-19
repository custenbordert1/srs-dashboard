import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  nextActionForWorkflowStatus,
  type CandidateWorkflowEvent,
  type CandidateWorkflowRecord,
  type CandidateWorkflowState,
  type CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";
import path from "node:path";

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "candidate-workflows.json");

async function readStore(): Promise<CandidateWorkflowState> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CandidateWorkflowState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(state: CandidateWorkflowState): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(state, null, 2), "utf8");
}

function event(type: CandidateWorkflowEvent["type"], message: string, createdAt: string): CandidateWorkflowEvent {
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt,
  };
}

export async function getCandidateWorkflowState(): Promise<CandidateWorkflowState> {
  return readStore();
}

export async function upsertCandidateWorkflow(input: {
  candidateId: string;
  workflowStatus?: CandidateWorkflowStatus;
  assignedDM?: string;
  note?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const state = await readStore();
  const existing = state[input.candidateId];
  const workflowStatus = input.workflowStatus ?? existing?.workflowStatus ?? "Needs Review";
  const assignedDM = input.assignedDM?.trim() || existing?.assignedDM || "Unassigned";
  const notes = input.note?.trim()
    ? [input.note.trim(), ...(existing?.notes ?? [])].slice(0, 25)
    : (existing?.notes ?? []);
  const history = [...(existing?.history ?? [])];

  if (!existing || existing.workflowStatus !== workflowStatus) {
    history.unshift(event("status", `Status changed to ${workflowStatus}.`, now));
  }
  if (input.note?.trim()) {
    history.unshift(event("note", `Note added: ${input.note.trim()}`, now));
  }
  if (input.assignedDM?.trim() && existing?.assignedDM !== assignedDM) {
    history.unshift(event("assignment", `Assigned DM changed to ${assignedDM}.`, now));
  }

  const record: CandidateWorkflowRecord = {
    candidateId: input.candidateId,
    workflowStatus,
    notes,
    assignedDM,
    lastActionAt: now,
    nextActionNeeded: nextActionForWorkflowStatus(workflowStatus),
    history: history.slice(0, 100),
    updatedAt: now,
  };

  state[input.candidateId] = record;
  await writeStore(state);
  return record;
}
