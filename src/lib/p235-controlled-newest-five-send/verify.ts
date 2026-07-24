import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P235_ALLOWED_CHANGED_FIELDS,
  P235_FORBIDDEN_CHANGED_FIELDS,
  P235_MAX_BATCH,
  P235_POST_SEND_STAGE,
  P235_REQUIRED_PAPERWORK_STATUS,
  P235_REQUIRED_RECRUITER,
  P235_SENT_PAPERWORK_STATUS,
  P235_TARGET_PN_STAGE,
  type P235CheckResult,
  type P235EvaluatedCandidate,
  type P235GlobalDiff,
  type P235WorkflowSnapshot,
} from "@/lib/p235-controlled-newest-five-send/types";

const BEYOND_PAPERWORK_SENT = new Set([
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

export function verifyP235PreSend(input: {
  member: P235EvaluatedCandidate;
  record: P235WorkflowSnapshot | undefined;
}): P235CheckResult {
  const failures: string[] = [];
  const { member, record } = input;
  if (!record) {
    return { ok: false, failures: [`workflow missing for ${member.candidateId}`] };
  }
  if (String(record.assignedRecruiter ?? "").trim() !== P235_REQUIRED_RECRUITER) {
    failures.push(`recruiter is "${record.assignedRecruiter}", expected ${P235_REQUIRED_RECRUITER}`);
  }
  const expectedDm = member.dm.proposedAssignedDM ?? "";
  if (String(record.assignedDM ?? "").trim() !== expectedDm) {
    failures.push(`assignedDM is "${record.assignedDM}", expected "${expectedDm}"`);
  }
  if (String(record.workflowStatus) !== P235_TARGET_PN_STAGE) {
    failures.push(`stage is "${record.workflowStatus}", expected "${P235_TARGET_PN_STAGE}"`);
  }
  if (String(record.paperworkStatus ?? "not_sent") !== P235_REQUIRED_PAPERWORK_STATUS) {
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

export function verifyP235PostSend(input: {
  member: P235EvaluatedCandidate;
  before: P235WorkflowSnapshot;
  after: P235WorkflowSnapshot;
}): P235CheckResult & {
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

  if (newStage !== P235_POST_SEND_STAGE) {
    failures.push(`new stage is "${newStage}", expected "${P235_POST_SEND_STAGE}"`);
  }
  if (BEYOND_PAPERWORK_SENT.has(newStage)) {
    failures.push(`advanced beyond Paperwork Sent to "${newStage}"`);
  }
  if (newPaperworkStatus !== P235_SENT_PAPERWORK_STATUS) {
    failures.push(`paperworkStatus is "${newPaperworkStatus}", expected sent`);
  }
  if (!String(after.signatureRequestId ?? "").trim()) {
    failures.push("signatureRequestId missing after send");
  }
  if (!String(after.paperworkSentAt ?? "").trim()) {
    failures.push("paperworkSentAt missing after send");
  }
  if (String(after.assignedRecruiter ?? "").trim() !== P235_REQUIRED_RECRUITER) {
    failures.push("recruiter drifted");
  }
  const expectedDm = member.dm.proposedAssignedDM ?? "";
  if (String(after.assignedDM ?? "").trim() !== expectedDm) {
    failures.push(`assignedDM drifted to "${after.assignedDM}"`);
  }

  // Notes may gain exactly the P65.6 promotion note; identity/contact notes must not be rewritten.
  const beforeNotes = before.notes ?? [];
  const afterNotes = after.notes ?? [];
  if (JSON.stringify(afterNotes) !== JSON.stringify(beforeNotes)) {
    const added = afterNotes.length - beforeNotes.length;
    const preserved = afterNotes.slice(added);
    const newest = afterNotes[0] ?? "";
    const p656Note =
      typeof newest === "string" &&
      /P65\.6 onboarding funnel promotion/i.test(newest);
    if (added < 0 || added > 1 || JSON.stringify(preserved) !== JSON.stringify(beforeNotes)) {
      failures.push("notes mutated beyond a single P65.6 promotion append");
    } else if (added === 1 && !p656Note) {
      failures.push("unexpected note appended (expected P65.6 promotion note only)");
    }
  }

  for (const field of changedFields) {
    if (P235_FORBIDDEN_CHANGED_FIELDS.has(field)) {
      failures.push(`forbidden field changed: ${field}`);
    } else if (!P235_ALLOWED_CHANGED_FIELDS.has(field)) {
      // During end-to-end verify we compare pre-pipeline to post-send; DM+stage+paperwork allowed.
      failures.push(`disallowed field changed: ${field}`);
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

export function diffP235GlobalStore(input: {
  before: Record<string, P235WorkflowSnapshot>;
  after: Record<string, P235WorkflowSnapshot>;
  targetIds: readonly string[];
}): P235GlobalDiff {
  const targets = new Set(input.targetIds);
  const targetIdsChanged: string[] = [];
  const nonTargetIdsChanged: string[] = [];
  const recordsAdded: string[] = [];
  const recordsRemoved: string[] = [];
  const fieldChangesById: Record<string, string[]> = {};

  const ids = new Set([...Object.keys(input.before), ...Object.keys(input.after)]);
  for (const id of ids) {
    const b = input.before[id];
    const a = input.after[id];
    if (!b && a) {
      recordsAdded.push(id);
      continue;
    }
    if (b && !a) {
      recordsRemoved.push(id);
      continue;
    }
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      (targets.has(id) ? targetIdsChanged : nonTargetIdsChanged).push(id);
      const fields: string[] = [];
      for (const key of new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])) {
        if (JSON.stringify((b as Record<string, unknown>)?.[key] ?? null) !==
          JSON.stringify((a as Record<string, unknown>)?.[key] ?? null)) {
          fields.push(key);
        }
      }
      fieldChangesById[id] = fields;
    }
  }

  return {
    phase: "P235",
    generatedAt: new Date().toISOString(),
    targetIdsChanged,
    nonTargetIdsChanged,
    recordsAdded,
    recordsRemoved,
    fieldChangesById,
    targetOnly:
      nonTargetIdsChanged.length === 0 &&
      recordsAdded.length === 0 &&
      recordsRemoved.length === 0,
    targetCount: targetIdsChanged.length,
    nonTargetCount: nonTargetIdsChanged.length,
  };
}

export function assertP235SignatureBudget(
  ids: Array<string | null | undefined>,
  expected: number,
): void {
  const unique = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (unique.length !== expected) {
    throw new Error(
      `P235 expected exactly ${expected} unique signature requests, got ${unique.length}`,
    );
  }
  if (expected > P235_MAX_BATCH) {
    throw new Error(`P235 signature count ${expected} exceeds max batch ${P235_MAX_BATCH}`);
  }
}

export function assertP235NoExternalWrite(context: string): void {
  if (/mel.?write|breezy.?write|assign.?recruiter|reminder.?email|reminder.?job/i.test(context)) {
    throw new Error(`P235 abort: disallowed external write path (${context})`);
  }
}
