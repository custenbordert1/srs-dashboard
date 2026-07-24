import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P239_ALLOWED_CHANGED_FIELDS,
  P239_FORBIDDEN_CHANGED_FIELDS,
  P239_MAX_BATCH,
  P239_PHASE,
  P239_POST_SEND_STAGE,
  P239_REQUIRED_PAPERWORK_STATUS,
  P239_REQUIRED_RECRUITER,
  P239_SENT_PAPERWORK_STATUS,
  P239_TARGET_PN_STAGE,
  type P239CheckResult,
  type P239EvaluatedCandidate,
  type P239GlobalDiff,
  type P239WorkflowSnapshot,
} from "@/lib/p239-final-remaining-auto-eligible-send/types";

const BEYOND_PAPERWORK_SENT = new Set([
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

export function assertP239NoExternalWrite(_label: string): void {
  // Sentinel — P239 never enables unattended P158 automation or MEL/Breezy writes.
}

export function assertP239SignatureBudget(
  signatureIds: Array<string | null | undefined>,
  expectedCount: number,
): void {
  const populated = signatureIds.filter((id) => Boolean(String(id ?? "").trim()));
  if (populated.length !== expectedCount) {
    throw new Error(
      `P239 signature budget mismatch: got=${populated.length} expected=${expectedCount}`,
    );
  }
  if (populated.length > P239_MAX_BATCH) {
    throw new Error(`P239 signature count ${populated.length} exceeds max ${P239_MAX_BATCH}`);
  }
  const unique = new Set(populated);
  if (unique.size !== populated.length) {
    throw new Error("P239 duplicate signatureRequestId detected");
  }
}

export function verifyP239PreSend(input: {
  member: P239EvaluatedCandidate;
  record: P239WorkflowSnapshot | undefined;
}): P239CheckResult {
  const failures: string[] = [];
  const { member, record } = input;
  if (!record) {
    return { ok: false, failures: [`workflow missing for ${member.candidateId}`] };
  }
  if (String(record.assignedRecruiter ?? "").trim() !== P239_REQUIRED_RECRUITER) {
    failures.push(`recruiter is "${record.assignedRecruiter}", expected ${P239_REQUIRED_RECRUITER}`);
  }
  const expectedDm = member.dm.proposedAssignedDM ?? "";
  if (String(record.assignedDM ?? "").trim() !== expectedDm) {
    failures.push(`assignedDM is "${record.assignedDM}", expected "${expectedDm}"`);
  }
  if (String(record.workflowStatus) !== P239_TARGET_PN_STAGE) {
    failures.push(`stage is "${record.workflowStatus}", expected "${P239_TARGET_PN_STAGE}"`);
  }
  if (String(record.paperworkStatus ?? "not_sent") !== P239_REQUIRED_PAPERWORK_STATUS) {
    failures.push(`paperworkStatus is "${record.paperworkStatus}", expected not_sent`);
  }
  if (String(record.signatureRequestId ?? "").trim()) {
    failures.push(`signatureRequestId already set: ${record.signatureRequestId}`);
  }
  const duplicate = duplicatePaperworkSendBlockReason({
    workflow: record as unknown as CandidateWorkflowRecord,
    activeOnboarding: null,
  });
  if (duplicate) failures.push(`duplicate send prevention: ${duplicate}`);
  return { ok: failures.length === 0, failures };
}

export function verifyP239PostSend(input: {
  member: P239EvaluatedCandidate;
  before: P239WorkflowSnapshot;
  after: P239WorkflowSnapshot;
}): P239CheckResult & {
  previousStage: string;
  newStage: string;
  previousPaperworkStatus: string;
  newPaperworkStatus: string;
  changedFields: string[];
} {
  const { member, before, after } = input;
  const failures: string[] = [];
  const changedFields: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changedFields.push(key);
    }
  }

  const previousStage = String(before.workflowStatus ?? "");
  const newStage = String(after.workflowStatus ?? "");
  const previousPaperworkStatus = String(before.paperworkStatus ?? "not_sent");
  const newPaperworkStatus = String(after.paperworkStatus ?? "not_sent");

  if (newStage !== P239_POST_SEND_STAGE) {
    failures.push(`new stage is "${newStage}", expected "${P239_POST_SEND_STAGE}"`);
  }
  if (BEYOND_PAPERWORK_SENT.has(newStage)) {
    failures.push(`advanced beyond Paperwork Sent to "${newStage}"`);
  }
  if (newPaperworkStatus !== P239_SENT_PAPERWORK_STATUS) {
    failures.push(`paperworkStatus is "${newPaperworkStatus}", expected sent`);
  }
  if (!String(after.signatureRequestId ?? "").trim()) {
    failures.push("signatureRequestId missing after send");
  }
  if (!String(after.paperworkSentAt ?? "").trim()) {
    failures.push("paperworkSentAt missing after send");
  }
  if (String(after.assignedRecruiter ?? "").trim() !== P239_REQUIRED_RECRUITER) {
    failures.push(`recruiter changed to "${after.assignedRecruiter}"`);
  }
  const expectedDm = member.dm.proposedAssignedDM ?? "";
  if (String(after.assignedDM ?? "").trim() !== expectedDm) {
    failures.push(`assignedDM is "${after.assignedDM}", expected "${expectedDm}"`);
  }
  for (const field of changedFields) {
    if (P239_FORBIDDEN_CHANGED_FIELDS.has(field)) {
      failures.push(`forbidden field changed: ${field}`);
    } else if (!P239_ALLOWED_CHANGED_FIELDS.has(field)) {
      if (!["actionHistory", "version", "schemaVersion"].includes(field)) {
        if (/email|phone|identity|name/i.test(field)) {
          failures.push(`unexpected identity-like field changed: ${field}`);
        }
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    previousStage,
    newStage,
    previousPaperworkStatus,
    newPaperworkStatus,
    changedFields,
  };
}

export function diffP239GlobalStore(input: {
  before: Record<string, P239WorkflowSnapshot>;
  after: Record<string, P239WorkflowSnapshot>;
  targetIds: string[];
}): P239GlobalDiff {
  const targetSet = new Set(input.targetIds);
  const beforeIds = new Set(Object.keys(input.before));
  const afterIds = new Set(Object.keys(input.after));
  const allIds = new Set([...beforeIds, ...afterIds]);

  const targetIdsChanged: string[] = [];
  const nonTargetIdsChanged: string[] = [];
  const recordsAdded: string[] = [];
  const recordsRemoved: string[] = [];
  const fieldChangesById: Record<string, string[]> = {};

  for (const id of allIds) {
    const before = input.before[id];
    const after = input.after[id];
    if (!before && after) {
      recordsAdded.push(id);
      if (targetSet.has(id)) targetIdsChanged.push(id);
      else nonTargetIdsChanged.push(id);
      continue;
    }
    if (before && !after) {
      recordsRemoved.push(id);
      if (targetSet.has(id)) targetIdsChanged.push(id);
      else nonTargetIdsChanged.push(id);
      continue;
    }
    if (!before || !after) continue;

    const changed: string[] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
        changed.push(key);
      }
    }
    if (changed.length === 0) continue;
    fieldChangesById[id] = changed;
    if (targetSet.has(id)) targetIdsChanged.push(id);
    else nonTargetIdsChanged.push(id);
  }

  return {
    phase: P239_PHASE,
    generatedAt: new Date().toISOString(),
    targetIdsChanged,
    nonTargetIdsChanged,
    recordsAdded,
    recordsRemoved,
    fieldChangesById,
    targetOnly: nonTargetIdsChanged.length === 0,
    targetCount: targetIdsChanged.length,
    nonTargetCount: nonTargetIdsChanged.length,
  };
}
