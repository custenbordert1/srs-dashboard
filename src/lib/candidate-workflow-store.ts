import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import {
  applyRecruitingActionToggle,
  completeFollowUpActions,
  emptyRecruitingActions,
  markNeedsFollowUp,
  scheduleFollowUpDue,
  type CandidateRecruitingActions,
  type RecruitingActionType,
} from "@/lib/candidate-recruiting-actions";
import { SLA_SNOOZE_HOURS } from "@/lib/candidate-action-sla";
import {
  defaultRecruiterRosters,
  normalizeWorkflowRecord,
  nextActionForWorkflowStatus,
  type CandidateWorkflowBundle,
  type CandidateWorkflowEvent,
  type CandidateWorkflowRecord,
  type CandidateWorkflowState,
  normalizePaperworkStatus,
  type CandidateWorkflowStatus,
  type CandidateWorkflowStoreFile,
  type PaperworkStatus,
  type RecruiterRosters,
} from "@/lib/candidate-workflow-types";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "candidate-workflows.json");
const WORKFLOW_AUDIT_PATH = path.join(STORE_DIR, "candidate-workflow-audit.jsonl");

export type CandidateWorkflowAuditEntry = {
  id: string;
  candidateId: string;
  action: string;
  ok: boolean;
  at: string;
  byUserId?: string;
  metadata?: Record<string, string | boolean | number>;
};

function sortedRoster(values: string[], anchor = "Unassigned"): string[] {
  const trimmed = values.map((v) => v.trim()).filter(Boolean);
  const unique = [...new Set(trimmed)];
  const rest = unique.filter((v) => v !== anchor).sort((a, b) => a.localeCompare(b));
  return unique.includes(anchor) ? [anchor, ...rest] : rest;
}

function event(type: CandidateWorkflowEvent["type"], message: string, createdAt: string): CandidateWorkflowEvent {
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt,
  };
}

function normalizeWorkflowsMap(raw: CandidateWorkflowState): CandidateWorkflowState {
  const out: CandidateWorkflowState = {};
  for (const [id, record] of Object.entries(raw)) {
    if (!record || typeof record !== "object") continue;
    out[id] = normalizeWorkflowRecord(id, record);
  }
  return out;
}

function normalizeStoreFile(parsed: unknown): CandidateWorkflowStoreFile {
  const now = new Date().toISOString();
  if (parsed && typeof parsed === "object" && "version" in parsed && (parsed as { version: number }).version === 2) {
    const file = parsed as CandidateWorkflowStoreFile;
    return {
      version: 2,
      workflows: normalizeWorkflowsMap(file.workflows ?? {}),
      rosters: {
        recruiters: sortedRoster(
          file.rosters?.recruiters?.length ? file.rosters.recruiters : defaultRecruiterRosters().recruiters,
        ),
        dms: sortedRoster(
          file.rosters?.dms?.length ? file.rosters.dms : defaultRecruiterRosters().dms,
          "Unassigned",
        ),
      },
      updatedAt: file.updatedAt ?? now,
    };
  }

  if (parsed && typeof parsed === "object" && !("version" in parsed)) {
    return {
      version: 2,
      workflows: normalizeWorkflowsMap(parsed as CandidateWorkflowState),
      rosters: defaultRecruiterRosters(),
      updatedAt: now,
    };
  }

  return {
    version: 2,
    workflows: {},
    rosters: defaultRecruiterRosters(),
    updatedAt: now,
  };
}

async function readStoreFile(): Promise<CandidateWorkflowStoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return normalizeStoreFile(JSON.parse(raw) as unknown);
  } catch {
    return {
      version: 2,
      workflows: {},
      rosters: defaultRecruiterRosters(),
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeStoreFile(file: CandidateWorkflowStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(file, null, 2), "utf8");
}

export async function appendCandidateWorkflowAudit(entry: CandidateWorkflowAuditEntry): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await appendFile(WORKFLOW_AUDIT_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function getCandidateWorkflowBundle(): Promise<CandidateWorkflowBundle> {
  const file = await readStoreFile();
  return {
    workflows: file.workflows,
    rosters: file.rosters,
    updatedAt: file.updatedAt,
  };
}

export async function getCandidateWorkflowState(): Promise<CandidateWorkflowState> {
  return (await readStoreFile()).workflows;
}

export async function getRecruiterRosters(): Promise<RecruiterRosters> {
  return (await readStoreFile()).rosters;
}

export async function saveRecruiterRosters(rosters: RecruiterRosters): Promise<RecruiterRosters> {
  const file = await readStoreFile();
  const now = new Date().toISOString();
  file.rosters = {
    recruiters: sortedRoster(rosters.recruiters),
    dms: sortedRoster(rosters.dms),
  };
  file.updatedAt = now;
  await writeStoreFile(file);
  return file.rosters;
}

export async function addRecruiterToServerRoster(name: string): Promise<RecruiterRosters> {
  const trimmed = name.trim();
  if (!trimmed) return getRecruiterRosters();
  const file = await readStoreFile();
  file.rosters.recruiters = sortedRoster([...file.rosters.recruiters, trimmed]);
  file.updatedAt = new Date().toISOString();
  await writeStoreFile(file);
  return file.rosters;
}

export async function addDmToServerRoster(name: string): Promise<RecruiterRosters> {
  const trimmed = name.trim();
  if (!trimmed) return getRecruiterRosters();
  const file = await readStoreFile();
  file.rosters.dms = sortedRoster([...file.rosters.dms, trimmed]);
  file.updatedAt = new Date().toISOString();
  await writeStoreFile(file);
  return file.rosters;
}

export async function upsertCandidateWorkflow(input: {
  candidateId: string;
  workflowStatus?: CandidateWorkflowStatus;
  assignedRecruiter?: string;
  assignedDM?: string;
  note?: string;
  recruitingActions?: CandidateRecruitingActions;
  followUpDueAt?: string | null;
  snoozedUntil?: string | null;
  signatureRequestId?: string | null;
  paperworkTemplateKey?: string | null;
  paperworkSentAt?: string | null;
  paperworkSignedAt?: string | null;
  paperworkStatus?: PaperworkStatus;
  paperworkError?: string | null;
  paperworkHistoryMessage?: string;
  audit?: { action: string; byUserId?: string; metadata?: CandidateWorkflowAuditEntry["metadata"] };
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];
  const workflowStatus = input.workflowStatus ?? existing?.workflowStatus ?? "Needs Review";
  const assignedRecruiter = input.assignedRecruiter?.trim() || existing?.assignedRecruiter || "Unassigned";
  const assignedDM = input.assignedDM?.trim() || existing?.assignedDM || "Unassigned";
  const notes = input.note?.trim()
    ? [input.note.trim(), ...(existing?.notes ?? [])].slice(0, 25)
    : (existing?.notes ?? []);
  const history = [...(existing?.history ?? [])];
  const recruitingActions = input.recruitingActions ?? existing?.recruitingActions ?? emptyRecruitingActions();
  const followUpDueAt =
    input.followUpDueAt !== undefined ? input.followUpDueAt : (existing?.followUpDueAt ?? null);
  const snoozedUntil =
    input.snoozedUntil !== undefined ? input.snoozedUntil : (existing?.snoozedUntil ?? null);
  const signatureRequestId =
    input.signatureRequestId !== undefined
      ? input.signatureRequestId
      : (existing?.signatureRequestId ?? null);
  const paperworkTemplateKey =
    input.paperworkTemplateKey !== undefined
      ? input.paperworkTemplateKey
      : (existing?.paperworkTemplateKey ?? null);
  const paperworkSentAt =
    input.paperworkSentAt !== undefined ? input.paperworkSentAt : (existing?.paperworkSentAt ?? null);
  const paperworkSignedAt =
    input.paperworkSignedAt !== undefined
      ? input.paperworkSignedAt
      : (existing?.paperworkSignedAt ?? null);
  const paperworkStatus =
    input.paperworkStatus !== undefined
      ? input.paperworkStatus
      : (existing?.paperworkStatus ?? "not_sent");
  const paperworkError =
    input.paperworkError !== undefined ? input.paperworkError : (existing?.paperworkError ?? null);

  if (!existing || existing.workflowStatus !== workflowStatus) {
    history.unshift(event("status", `Status changed to ${workflowStatus}.`, now));
  }
  if (input.note?.trim()) {
    history.unshift(event("note", `Note added: ${input.note.trim()}`, now));
  }
  if (input.assignedDM?.trim() && existing?.assignedDM !== assignedDM) {
    history.unshift(event("assignment", `Assigned DM changed to ${assignedDM}.`, now));
  }
  if (input.assignedRecruiter?.trim() && existing?.assignedRecruiter !== assignedRecruiter) {
    history.unshift(event("assignment", `Assigned recruiter changed to ${assignedRecruiter}.`, now));
  }
  if (
    input.recruitingActions &&
    existing &&
    JSON.stringify(existing.recruitingActions) !== JSON.stringify(recruitingActions)
  ) {
    history.unshift(event("note", `Recruiting action flags updated.`, now));
  }
  if (input.snoozedUntil && existing?.snoozedUntil !== snoozedUntil) {
    history.unshift(event("snooze", `Snoozed until ${snoozedUntil}.`, now));
  }
  if (input.followUpDueAt !== undefined && existing?.followUpDueAt !== followUpDueAt) {
    history.unshift(
      event(
        "follow_up",
        followUpDueAt ? `Follow-up due ${followUpDueAt}.` : "Follow-up cleared.",
        now,
      ),
    );
  }
  if (input.paperworkHistoryMessage?.trim()) {
    history.unshift(event("paperwork", input.paperworkHistoryMessage.trim(), now));
  }

  const record: CandidateWorkflowRecord = {
    candidateId: input.candidateId,
    workflowStatus,
    notes,
    assignedRecruiter,
    assignedDM,
    lastActionAt: now,
    nextActionNeeded: nextActionForWorkflowStatus(workflowStatus),
    history: history.slice(0, 100),
    recruitingActions,
    followUpDueAt,
    snoozedUntil,
    signatureRequestId,
    paperworkTemplateKey,
    paperworkSentAt,
    paperworkSignedAt,
    paperworkStatus,
    paperworkError,
    updatedAt: now,
  };

  file.workflows[input.candidateId] = record;
  file.updatedAt = now;
  await writeStoreFile(file);

  if (input.audit) {
    await appendCandidateWorkflowAudit({
      id: randomUUID(),
      candidateId: input.candidateId,
      action: input.audit.action,
      ok: true,
      at: now,
      byUserId: input.audit.byUserId,
      metadata: input.audit.metadata,
    });
  }

  return record;
}

export async function toggleCandidateRecruitingAction(input: {
  candidateId: string;
  type: RecruitingActionType;
  enabled?: boolean;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = Date.now();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];
  const current = existing?.recruitingActions ?? emptyRecruitingActions();
  let recruitingActions = applyRecruitingActionToggle(current, input.type, input.enabled);
  let followUpDueAt = existing?.followUpDueAt ?? null;

  if (input.type === "needs-follow-up") {
    const enabling =
      input.enabled ??
      !current.needsFollowUp;
    if (enabling) {
      recruitingActions = markNeedsFollowUp(recruitingActions, now);
      followUpDueAt = scheduleFollowUpDue(now);
    } else {
      recruitingActions = completeFollowUpActions(recruitingActions, now);
      followUpDueAt = null;
    }
  }

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: existing?.workflowStatus,
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions,
    followUpDueAt,
    audit: {
      action: "toggle_recruiting_action",
      byUserId: input.byUserId,
      metadata: { recruitingActionType: input.type },
    },
  });
}

export async function completeCandidateFollowUp(input: {
  candidateId: string;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];
  const now = Date.now();
  const recruitingActions = completeFollowUpActions(
    existing?.recruitingActions ?? emptyRecruitingActions(),
    now,
  );

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: existing?.workflowStatus,
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions,
    followUpDueAt: null,
    audit: { action: "complete_follow_up", byUserId: input.byUserId },
  });
}

export async function snoozeCandidateWorkflow(input: {
  candidateId: string;
  hours?: number;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const hours = input.hours ?? SLA_SNOOZE_HOURS;
  const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: existing?.workflowStatus,
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions: existing?.recruitingActions,
    snoozedUntil: until,
    audit: { action: "snooze", byUserId: input.byUserId, metadata: { hours } },
  });
}

export async function recordCandidatePaperworkSent(input: {
  candidateId: string;
  signatureRequestId: string;
  templateKey: OnboardingTemplateKey;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: "Paperwork Sent",
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions: existing?.recruitingActions,
    signatureRequestId: input.signatureRequestId,
    paperworkTemplateKey: input.templateKey,
    paperworkSentAt: now,
    paperworkSignedAt: null,
    paperworkStatus: "sent",
    paperworkError: null,
    paperworkHistoryMessage: `Onboarding paperwork sent (${input.templateKey}). Request ${input.signatureRequestId}.`,
    audit: {
      action: "paperwork_sent",
      byUserId: input.byUserId,
      metadata: {
        templateKey: input.templateKey,
        signatureRequestId: input.signatureRequestId,
      },
    },
  });
}

export async function applyCandidatePaperworkStatus(input: {
  candidateId: string;
  signatureRequestId: string;
  paperworkStatus: PaperworkStatus;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];
  const status = normalizePaperworkStatus(input.paperworkStatus);
  const workflowStatus =
    status === "signed"
      ? "Signed"
      : existing?.workflowStatus === "Paperwork Sent"
        ? "Paperwork Sent"
        : (existing?.workflowStatus ?? "Paperwork Sent");

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus,
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions: existing?.recruitingActions,
    signatureRequestId: input.signatureRequestId,
    paperworkTemplateKey: existing?.paperworkTemplateKey ?? null,
    paperworkSentAt: existing?.paperworkSentAt ?? now,
    paperworkSignedAt: status === "signed" ? now : (existing?.paperworkSignedAt ?? null),
    paperworkStatus: status,
    paperworkError: status === "failed" ? (existing?.paperworkError ?? "Paperwork failed") : null,
    paperworkHistoryMessage: `Paperwork status: ${status}.`,
    audit: {
      action: "paperwork_status",
      byUserId: input.byUserId,
      metadata: { paperworkStatus: status },
    },
  });
}

export async function recordCandidatePaperworkFailed(input: {
  candidateId: string;
  error: string;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: existing?.workflowStatus ?? "Paperwork Needed",
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions: existing?.recruitingActions,
    paperworkStatus: "failed",
    paperworkError: input.error,
    paperworkHistoryMessage: `Paperwork send failed: ${input.error}`,
    audit: { action: "paperwork_failed", byUserId: input.byUserId },
  });
}

export function findCandidateIdBySignatureRequest(
  workflows: CandidateWorkflowState,
  signatureRequestId: string,
): string | null {
  for (const [candidateId, record] of Object.entries(workflows)) {
    if (record.signatureRequestId === signatureRequestId) return candidateId;
  }
  return null;
}
