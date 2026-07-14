import { readFile, writeFile, appendFile } from "node:fs/promises";
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
import { incrementWorkflowScans } from "@/lib/app-performance/performance-metrics";
import type { DirectDepositStatus } from "@/lib/direct-deposit-types";
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
  type RecruiterAssignmentSource,
  type RecruiterActionPriority,
  type RecruiterActionType,
  type RecruiterRosters,
} from "@/lib/candidate-workflow-types";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import {
  resolvePaperworkStatus,
  resolveWorkflowStatus,
} from "@/lib/workflow-onboarding-reconciliation/workflow-durability";
import { decideOwnershipWrite } from "@/lib/p188-4-recruiter-ownership-durability/precedence";
import {
  assertOwnershipCas,
  mergeWorkflowMapsForDurableWrite,
} from "@/lib/p188-4-recruiter-ownership-durability/ownershipMerge";
import { appendOwnershipLedgerEvent } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

/** Serialize workflow store mutations to prevent lost updates (P188.4). */
let workflowStoreWriteChain: Promise<void> = Promise.resolve();

function withWorkflowStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = workflowStoreWriteChain.then(fn, fn);
  workflowStoreWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function workflowDataDir(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  return override ? path.resolve(override) : recruitingDataDir();
}

function storePaths() {
  const dir = workflowDataDir();
  return {
    storeDir: dir,
    storePath: path.join(dir, "candidate-workflows.json"),
    auditPath: path.join(dir, "candidate-workflow-audit.jsonl"),
  };
}

export type CandidateWorkflowAuditEntry = {
  id: string;
  candidateId: string;
  action: string;
  ok: boolean;
  at: string;
  byUserId?: string;
  metadata?: Record<string, string | boolean | number>;
};

export class OwnershipConcurrencyError extends Error {
  readonly code = "OWNERSHIP_CONCURRENCY_CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "OwnershipConcurrencyError";
  }
}

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
  const { storePath } = storePaths();
  try {
    const raw = await readFile(storePath, "utf8");
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
  const { storeDir, storePath } = storePaths();
  await safeRecruitingMkdir(storeDir);
  const disk = await readStoreFile();
  const merged: CandidateWorkflowStoreFile = {
    version: 2,
    rosters: {
      recruiters: sortedRoster(
        file.rosters?.recruiters?.length ? file.rosters.recruiters : disk.rosters.recruiters,
      ),
      dms: sortedRoster(file.rosters?.dms?.length ? file.rosters.dms : disk.rosters.dms),
    },
    workflows: mergeWorkflowMapsForDurableWrite(disk.workflows, file.workflows),
    updatedAt: file.updatedAt ?? new Date().toISOString(),
  };
  await writeFile(storePath, JSON.stringify(merged, null, 2), "utf8");
}

export async function appendCandidateWorkflowAudit(entry: CandidateWorkflowAuditEntry): Promise<void> {
  const { storeDir, auditPath } = storePaths();
  await safeRecruitingMkdir(storeDir);
  await appendFile(auditPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function getCandidateWorkflowBundle(): Promise<CandidateWorkflowBundle> {
  incrementWorkflowScans();
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
  paperworkViewedAt?: string | null;
  paperworkViewCount?: number;
  paperworkSignedAt?: string | null;
  paperworkStatus?: PaperworkStatus;
  paperworkError?: string | null;
  onboardingContactEmail?: string | null;
  directDepositStatus?: DirectDepositStatus;
  directDepositRequestedAt?: string | null;
  directDepositLastReminderAt?: string | null;
  directDepositNotes?: string | null;
  directDepositTriggeredByUserId?: string | null;
  directDepositLastDeliveryMode?: "log" | "resend" | null;
  directDepositLastHrCopyIncluded?: boolean | null;
  directDepositLastHrBccAddress?: string | null;
  paperworkHistoryMessage?: string;
  recruiterAssignmentSource?: RecruiterAssignmentSource | null;
  recruiterAssignmentReason?: string | null;
  recruiterAssignmentConfidence?: number | null;
  requiredAction?: string | null;
  actionType?: RecruiterActionType | null;
  actionPriority?: RecruiterActionPriority | null;
  actionReason?: string | null;
  actionDueDate?: string | null;
  actionConfidence?: number | null;
  actionGeneratedAt?: string | null;
  recommendedStage?: string | null;
  progressionReason?: string | null;
  progressionConfidence?: number | null;
  progressionPriority?: RecruiterActionPriority | null;
  progressionGeneratedAt?: string | null;
  /** When true, allow workflowStatus to regress from advanced paperwork stages. */
  forceWorkflowStatus?: boolean;
  /** When true, allow paperworkStatus to regress from sent/viewed/signed. */
  forcePaperworkStatus?: boolean;
  /** P188.4 optimistic concurrency — fail closed on mismatch. */
  expectedOwnershipVersion?: number | null;
  expectedRecruiter?: string | null;
  /** Allow explicit overwrite of sticky higher-priority owners (manual/operator). */
  allowForceOverwrite?: boolean;
  /** Skip ownership ledger append (tests / pure metadata updates). */
  skipOwnershipLedger?: boolean;
  audit?: { action: string; byUserId?: string; metadata?: CandidateWorkflowAuditEntry["metadata"] };
}): Promise<CandidateWorkflowRecord> {
  return withWorkflowStoreLock(() => upsertCandidateWorkflowUnlocked(input));
}

async function upsertCandidateWorkflowUnlocked(input: Parameters<typeof upsertCandidateWorkflow>[0]): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];

  const cas = assertOwnershipCas({
    existing,
    expectedOwnershipVersion: input.expectedOwnershipVersion,
    expectedRecruiter: input.expectedRecruiter,
  });
  if (!cas.ok) {
    throw new OwnershipConcurrencyError(cas.detail);
  }

  const workflowStatus = resolveWorkflowStatus(
    input.workflowStatus,
    existing,
    input.forceWorkflowStatus ?? false,
  );
  const ownershipDecision = decideOwnershipWrite({
    incomingRecruiter: input.assignedRecruiter,
    incomingSource: input.recruiterAssignmentSource,
    existingRecruiter: existing?.assignedRecruiter,
    existingSource: existing?.recruiterAssignmentSource,
    allowForceOverwrite:
      input.allowForceOverwrite === true ||
      input.recruiterAssignmentSource === "manual" ||
      input.recruiterAssignmentSource === "operator_restore" ||
      input.recruiterAssignmentSource === "operator_confirmed_historical_restore",
  });
  const assignedRecruiter = ownershipDecision.recruiter;
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
  const paperworkViewedAt =
    input.paperworkViewedAt !== undefined
      ? input.paperworkViewedAt
      : (existing?.paperworkViewedAt ?? null);
  const paperworkViewCount =
    input.paperworkViewCount !== undefined
      ? input.paperworkViewCount
      : (existing?.paperworkViewCount ?? 0);
  const paperworkSignedAt =
    input.paperworkSignedAt !== undefined
      ? input.paperworkSignedAt
      : (existing?.paperworkSignedAt ?? null);
  const paperworkStatus =
    input.paperworkStatus !== undefined
      ? resolvePaperworkStatus(
          input.paperworkStatus,
          existing?.paperworkStatus,
          input.forcePaperworkStatus ?? false,
        )
      : (existing?.paperworkStatus ?? "not_sent");
  const paperworkError =
    input.paperworkError !== undefined ? input.paperworkError : (existing?.paperworkError ?? null);
  const onboardingContactEmail =
    input.onboardingContactEmail !== undefined
      ? input.onboardingContactEmail
      : (existing?.onboardingContactEmail ?? null);
  const directDepositStatus =
    input.directDepositStatus !== undefined
      ? input.directDepositStatus
      : (existing?.directDepositStatus ?? "not_requested");
  const directDepositRequestedAt =
    input.directDepositRequestedAt !== undefined
      ? input.directDepositRequestedAt
      : (existing?.directDepositRequestedAt ?? null);
  const directDepositLastReminderAt =
    input.directDepositLastReminderAt !== undefined
      ? input.directDepositLastReminderAt
      : (existing?.directDepositLastReminderAt ?? null);
  const directDepositNotes =
    input.directDepositNotes !== undefined
      ? input.directDepositNotes
      : (existing?.directDepositNotes ?? null);
  const directDepositTriggeredByUserId =
    input.directDepositTriggeredByUserId !== undefined
      ? input.directDepositTriggeredByUserId
      : (existing?.directDepositTriggeredByUserId ?? null);
  const directDepositLastDeliveryMode =
    input.directDepositLastDeliveryMode !== undefined
      ? input.directDepositLastDeliveryMode
      : (existing?.directDepositLastDeliveryMode ?? null);
  const directDepositLastHrCopyIncluded =
    input.directDepositLastHrCopyIncluded !== undefined
      ? input.directDepositLastHrCopyIncluded
      : (existing?.directDepositLastHrCopyIncluded ?? null);
  const directDepositLastHrBccAddress =
    input.directDepositLastHrBccAddress !== undefined
      ? input.directDepositLastHrBccAddress
      : (existing?.directDepositLastHrBccAddress ?? null);
  const recruiterAssignmentSource = ownershipDecision.applied
    ? ((ownershipDecision.source as RecruiterAssignmentSource | null) ??
      input.recruiterAssignmentSource ??
      existing?.recruiterAssignmentSource ??
      null)
    : (existing?.recruiterAssignmentSource ??
      (ownershipDecision.source as RecruiterAssignmentSource | null) ??
      null);
  const recruiterAssignmentReason =
    ownershipDecision.applied && input.recruiterAssignmentReason !== undefined
      ? input.recruiterAssignmentReason
      : ownershipDecision.applied
        ? (input.recruiterAssignmentReason ?? existing?.recruiterAssignmentReason ?? null)
        : (existing?.recruiterAssignmentReason ?? null);
  const recruiterAssignmentConfidence =
    ownershipDecision.applied && input.recruiterAssignmentConfidence !== undefined
      ? input.recruiterAssignmentConfidence
      : ownershipDecision.applied
        ? (input.recruiterAssignmentConfidence ?? existing?.recruiterAssignmentConfidence ?? null)
        : (existing?.recruiterAssignmentConfidence ?? null);
  const ownershipChanged =
    Boolean(existing?.assignedRecruiter) && existing!.assignedRecruiter !== assignedRecruiter
      ? true
      : !existing && assignedRecruiter !== "Unassigned"
        ? true
        : (existing?.assignedRecruiter ?? "Unassigned") !== assignedRecruiter;
  const recruiterAssignedAt = ownershipChanged
    ? now
    : (existing?.recruiterAssignedAt ?? null);
  const recruiterOwnershipVersion = ownershipChanged
    ? (existing?.recruiterOwnershipVersion ?? 0) + 1
    : (existing?.recruiterOwnershipVersion ?? 0);

  const requiredAction =
    input.requiredAction !== undefined ? input.requiredAction : (existing?.requiredAction ?? null);
  const actionType =
    input.actionType !== undefined ? input.actionType : (existing?.actionType ?? null);
  const actionPriority =
    input.actionPriority !== undefined ? input.actionPriority : (existing?.actionPriority ?? null);
  const actionReason =
    input.actionReason !== undefined ? input.actionReason : (existing?.actionReason ?? null);
  const actionDueDate =
    input.actionDueDate !== undefined ? input.actionDueDate : (existing?.actionDueDate ?? null);
  const actionConfidence =
    input.actionConfidence !== undefined ? input.actionConfidence : (existing?.actionConfidence ?? null);
  const actionGeneratedAt =
    input.actionGeneratedAt !== undefined ? input.actionGeneratedAt : (existing?.actionGeneratedAt ?? null);
  const recommendedStage =
    input.recommendedStage !== undefined ? input.recommendedStage : (existing?.recommendedStage ?? null);
  const progressionReason =
    input.progressionReason !== undefined ? input.progressionReason : (existing?.progressionReason ?? null);
  const progressionConfidence =
    input.progressionConfidence !== undefined
      ? input.progressionConfidence
      : (existing?.progressionConfidence ?? null);
  const progressionPriority =
    input.progressionPriority !== undefined
      ? input.progressionPriority
      : (existing?.progressionPriority ?? null);
  const progressionGeneratedAt =
    input.progressionGeneratedAt !== undefined
      ? input.progressionGeneratedAt
      : (existing?.progressionGeneratedAt ?? null);

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
    if (ownershipDecision.applied && recruiterAssignmentSource === "auto") {
      history.unshift(
        event(
          "assignment",
          `Auto-assigned recruiter ${assignedRecruiter} (${recruiterAssignmentConfidence ?? 0}% confidence).`,
          now,
        ),
      );
    } else if (ownershipDecision.applied) {
      history.unshift(event("assignment", `Assigned recruiter changed to ${assignedRecruiter}.`, now));
    } else {
      history.unshift(
        event(
          "assignment",
          `Ownership write blocked (${ownershipDecision.reason}); retained ${assignedRecruiter}.`,
          now,
        ),
      );
    }
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
  if (
    input.requiredAction?.trim() &&
    existing?.requiredAction !== input.requiredAction.trim()
  ) {
    history.unshift(
      event(
        "note",
        `Recruiter action: ${input.requiredAction.trim()} (${input.actionPriority ?? "medium"} priority).`,
        now,
      ),
    );
  }
  if (
    input.recommendedStage?.trim() &&
    existing?.recommendedStage !== input.recommendedStage.trim()
  ) {
    history.unshift(
      event(
        "note",
        `Progression: ${input.recommendedStage.trim()} (${input.progressionPriority ?? "medium"} priority).`,
        now,
      ),
    );
  }

  const record: CandidateWorkflowRecord = {
    candidateId: input.candidateId,
    workflowStatus,
    notes,
    assignedRecruiter,
    assignedDM,
    lastActionAt: now,
    nextActionNeeded:
      requiredAction?.trim() ||
      existing?.requiredAction?.trim() ||
      nextActionForWorkflowStatus(workflowStatus),
    history: history.slice(0, 100),
    recruitingActions,
    followUpDueAt,
    snoozedUntil,
    signatureRequestId,
    paperworkTemplateKey,
    paperworkSentAt,
    paperworkViewedAt,
    paperworkViewCount,
    paperworkSignedAt,
    paperworkStatus,
    paperworkError,
    onboardingContactEmail,
    directDepositStatus,
    directDepositRequestedAt,
    directDepositLastReminderAt,
    directDepositNotes,
    directDepositTriggeredByUserId,
    directDepositLastDeliveryMode,
    directDepositLastHrCopyIncluded,
    directDepositLastHrBccAddress,
    recruiterAssignmentSource,
    recruiterAssignmentReason,
    recruiterAssignmentConfidence,
    recruiterAssignedAt,
    recruiterOwnershipVersion,
    requiredAction,
    actionType,
    actionPriority,
    actionReason,
    actionDueDate,
    actionConfidence,
    actionGeneratedAt,
    recommendedStage,
    progressionReason,
    progressionConfidence,
    progressionPriority,
    progressionGeneratedAt,
    updatedAt: now,
  };

  file.workflows[input.candidateId] = record;
  file.updatedAt = now;
  await writeStoreFile(file);

  if (
    ownershipChanged &&
    ownershipDecision.applied &&
    !input.skipOwnershipLedger &&
    assignedRecruiter !== (existing?.assignedRecruiter ?? "Unassigned")
  ) {
    const correlationId = randomUUID();
    const idempotencyKey = `own:${input.candidateId}:${recruiterOwnershipVersion}:${assignedRecruiter}`;
    await appendOwnershipLedgerEvent({
      candidateId: input.candidateId,
      previousRecruiter: existing?.assignedRecruiter ?? null,
      newRecruiter: assignedRecruiter,
      source: ownershipDecision.source ?? "unassigned",
      actor: input.audit?.byUserId ?? "system",
      actorRole:
        ownershipDecision.source === "manual" ||
        ownershipDecision.source === "operator_restore" ||
        ownershipDecision.source === "operator_confirmed_historical_restore"
          ? "operator"
          : "system",
      reason: input.recruiterAssignmentReason ?? ownershipDecision.reason,
      correlationId,
      idempotencyKey,
      workflowVersion: recruiterOwnershipVersion,
      confidence: recruiterAssignmentConfidence,
      evidenceReference: input.audit?.action ?? null,
      rollbackReference: existing
        ? `rollback:${input.candidateId}:v${existing.recruiterOwnershipVersion ?? 0}`
        : null,
    });
  }

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

  // P186.2 shadow dual-write observe — production store remains authoritative.
  // Failures are swallowed; never blocks workflow upsert.
  void import("@/lib/p186-2-event-adapters")
    .then(({ observeWorkflowUpsertSafe }) =>
      observeWorkflowUpsertSafe({
        candidateId: input.candidateId,
        workflowStatus: record.workflowStatus,
        paperworkStatus: record.paperworkStatus,
      }),
    )
    .catch(() => undefined);

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
  onboardingContactEmail?: string | null;
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
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: "sent",
    paperworkError: null,
    onboardingContactEmail: input.onboardingContactEmail?.trim() || null,
    paperworkHistoryMessage: `Onboarding paperwork sent (${input.templateKey}). Request ${input.signatureRequestId}.`,
    audit: {
      action: "paperwork_sent",
      byUserId: input.byUserId,
      metadata: {
        templateKey: input.templateKey,
        signatureRequestId: input.signatureRequestId,
        onboardingContactEmail: input.onboardingContactEmail?.trim() || "",
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
    paperworkViewedAt: existing?.paperworkViewedAt ?? null,
    paperworkViewCount: existing?.paperworkViewCount ?? 0,
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

export async function applyCandidatePaperworkViewed(input: {
  candidateId: string;
  signatureRequestId: string;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];
  if (existing?.paperworkStatus === "signed") {
    return existing;
  }

  const viewCount = (existing?.paperworkViewCount ?? 0) + 1;

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: "Paperwork Sent",
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions: existing?.recruitingActions,
    signatureRequestId: input.signatureRequestId,
    paperworkTemplateKey: existing?.paperworkTemplateKey ?? null,
    paperworkSentAt: existing?.paperworkSentAt ?? now,
    paperworkViewedAt: existing?.paperworkViewedAt ?? now,
    paperworkViewCount: viewCount,
    paperworkSignedAt: null,
    paperworkStatus: "viewed",
    paperworkError: null,
    paperworkHistoryMessage: `Candidate viewed onboarding paperwork (view #${viewCount}).`,
    audit: {
      action: "paperwork_viewed",
      byUserId: input.byUserId,
      metadata: { viewCount },
    },
  });
}

function clearPaperworkPendingActions(
  actions: CandidateRecruitingActions,
): CandidateRecruitingActions {
  return {
    ...actions,
    onboardingPacketPrep: false,
    needsFollowUp: actions.needsFollowUp,
  };
}

export async function applyCandidatePaperworkSigned(input: {
  candidateId: string;
  signatureRequestId: string;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord> {
  const now = new Date().toISOString();
  const file = await readStoreFile();
  const existing = file.workflows[input.candidateId];
  if (existing?.paperworkStatus === "signed" && existing.paperworkSignedAt) {
    return existing;
  }

  const recruitingActions = clearPaperworkPendingActions(
    existing?.recruitingActions ?? emptyRecruitingActions(),
  );

  return upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: "Signed",
    assignedRecruiter: existing?.assignedRecruiter,
    assignedDM: existing?.assignedDM,
    recruitingActions,
    signatureRequestId: input.signatureRequestId,
    paperworkTemplateKey: existing?.paperworkTemplateKey ?? null,
    paperworkSentAt: existing?.paperworkSentAt ?? now,
    paperworkViewedAt: existing?.paperworkViewedAt ?? null,
    paperworkViewCount: existing?.paperworkViewCount ?? 0,
    paperworkSignedAt: now,
    paperworkStatus: "signed",
    paperworkError: null,
    paperworkHistoryMessage: "Dropbox Sign webhook: paperwork signed.",
    audit: {
      action: "paperwork_signed",
      byUserId: input.byUserId,
      metadata: { signatureRequestId: input.signatureRequestId },
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
