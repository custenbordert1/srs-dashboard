import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P221_ALLOWED_CHANGED_FIELDS,
  P221_MAX_CANDIDATES,
  P221_POST_SEND_STAGE,
  P221_REQUIRED_PAPERWORK_STATUS,
  P221_REQUIRED_STAGE,
  P221_SENT_PAPERWORK_STATUS,
  P221_TARGETS,
  type P221CheckResult,
  type P221EligibilityEvidence,
  type P221FieldDiff,
  type P221GlobalDiff,
  type P221PostWriteResult,
  type P221Target,
  type P221WorkflowSnapshot,
} from "@/lib/p221-controlled-dropbox-sign-send/types";

const BEYOND_PAPERWORK_SENT = new Set([
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

export function isP221ApprovedCandidateId(candidateId: string): boolean {
  return P221_TARGETS.some((target) => target.candidateId === candidateId);
}

export function findP221Target(candidateId: string): P221Target | undefined {
  return P221_TARGETS.find((target) => target.candidateId === candidateId);
}

export function verifyP221AssignedDm(
  target: P221Target,
  record: P221WorkflowSnapshot | undefined,
): P221CheckResult {
  const failures: string[] = [];
  if (!record) {
    return { ok: false, failures: [`workflow record missing for ${target.candidateId}`] };
  }
  if (!isP221ApprovedCandidateId(record.candidateId)) {
    failures.push(`candidate ${record.candidateId} is not an approved P221 target`);
  }
  if (String(record.assignedDM ?? "").trim() !== target.expectedDm) {
    failures.push(
      `assignedDM is "${record.assignedDM}", expected "${target.expectedDm}"`,
    );
  }
  return { ok: failures.length === 0, failures };
}

export function verifyP221Eligibility(
  target: P221Target,
  record: P221WorkflowSnapshot,
  evidence: P221EligibilityEvidence,
): P221CheckResult {
  const gates = evaluateP214Gates({
    nearestActiveWorkMiles: evidence.nearestActiveWorkMiles,
    hasActiveOpportunities: evidence.hasActiveOpportunities,
    coverageKnown: evidence.coverageKnown,
    assignedDm: String(record.assignedDM ?? ""),
    expectedDm: target.expectedDm,
    jobCity: evidence.jobCity,
    jobState: evidence.jobState,
  });
  if (gates.eligible) return { ok: true, failures: [] };
  return {
    ok: false,
    failures: [`not eligible: ${gates.blockers.join(", ") || "unknown"}`],
  };
}

/**
 * Part — Preflight before any Dropbox Sign call.
 */
export function verifyP221Preflight(
  target: P221Target,
  record: P221WorkflowSnapshot | undefined,
  evidence: P221EligibilityEvidence,
): P221CheckResult {
  const failures: string[] = [];
  if (!isP221ApprovedCandidateId(target.candidateId)) {
    failures.push(`candidate ${target.candidateId} is not an approved P221 target`);
  }
  const dm = verifyP221AssignedDm(target, record);
  failures.push(...dm.failures);
  if (!record) return { ok: false, failures };

  if (String(record.workflowStatus ?? "") !== P221_REQUIRED_STAGE) {
    failures.push(
      `workflow stage is "${record.workflowStatus}", expected "${P221_REQUIRED_STAGE}"`,
    );
  }
  if (String(record.paperworkStatus ?? "") !== P221_REQUIRED_PAPERWORK_STATUS) {
    failures.push(
      `paperworkStatus is "${record.paperworkStatus}", expected "${P221_REQUIRED_PAPERWORK_STATUS}"`,
    );
  }
  if (String(record.signatureRequestId ?? "").trim()) {
    failures.push(
      `signatureRequestId is already set ("${record.signatureRequestId}") — duplicate send blocked`,
    );
  }

  const duplicate = duplicatePaperworkSendBlockReason({
    workflow: record as unknown as CandidateWorkflowRecord,
    activeOnboarding: null,
  });
  if (duplicate) {
    failures.push(`duplicate send prevention: ${duplicate}`);
  }

  const eligibility = verifyP221Eligibility(target, record, evidence);
  failures.push(...eligibility.failures);

  return { ok: failures.length === 0, failures };
}

function diffChangedFields(
  before: P221WorkflowSnapshot,
  after: P221WorkflowSnapshot,
): P221FieldDiff[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: P221FieldDiff[] = [];
  for (const field of fields) {
    if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
      changed.push({ field, allowed: P221_ALLOWED_CHANGED_FIELDS.has(field) });
    }
  }
  return changed;
}

/**
 * Read-back after send: exactly one new signature request, paperwork sent,
 * DM/recruiter/notes unchanged, stage at most Paperwork Sent.
 */
export function verifyP221PostWrite(args: {
  target: P221Target;
  before: P221WorkflowSnapshot;
  after: P221WorkflowSnapshot;
}): P221PostWriteResult {
  const { target, before, after } = args;
  const failures: string[] = [];
  const changedFields = diffChangedFields(before, after);
  const previousStage = String(before.workflowStatus ?? "");
  const newStage = String(after.workflowStatus ?? "");
  const previousPaperworkStatus = String(before.paperworkStatus ?? "not_sent");
  const newPaperworkStatus = String(after.paperworkStatus ?? "not_sent");

  if (newStage !== P221_POST_SEND_STAGE) {
    failures.push(`new stage is "${newStage}", expected "${P221_POST_SEND_STAGE}"`);
  }
  if (BEYOND_PAPERWORK_SENT.has(newStage)) {
    failures.push(`advanced beyond Paperwork Sent to "${newStage}"`);
  }
  if (newPaperworkStatus !== P221_SENT_PAPERWORK_STATUS) {
    failures.push(
      `paperworkStatus is "${newPaperworkStatus}", expected "${P221_SENT_PAPERWORK_STATUS}"`,
    );
  }
  if (!String(after.signatureRequestId ?? "").trim()) {
    failures.push("signatureRequestId missing after send");
  }
  if (!String(after.paperworkSentAt ?? "").trim()) {
    failures.push("paperworkSentAt missing after send");
  }

  if (String(after.assignedDM ?? "") !== target.expectedDm) {
    failures.push(`assignedDM drifted to "${after.assignedDM}"`);
  }
  if (String(after.assignedDM ?? "") !== String(before.assignedDM ?? "")) {
    failures.push("assignedDM must not change under P221");
  }
  if (
    String(after.assignedRecruiter ?? "Unassigned") !==
    String(before.assignedRecruiter ?? "Unassigned")
  ) {
    failures.push("assignedRecruiter must not change under P221");
  }
  if (JSON.stringify(after.notes ?? []) !== JSON.stringify(before.notes ?? [])) {
    failures.push("notes must not change under P221");
  }

  for (const change of changedFields) {
    if (!change.allowed) {
      failures.push(`disallowed field changed: ${change.field}`);
    }
  }

  const beforeHistory = before.history ?? [];
  const afterHistory = after.history ?? [];
  const historyChanged = changedFields.some((change) => change.field === "history");
  if (!historyChanged) {
    failures.push("expected paperwork history event(s)");
  } else {
    const addedCount = afterHistory.length - beforeHistory.length;
    // Stage move Paperwork Needed → Paperwork Sent prepends a status event,
    // then paperworkHistoryMessage prepends a paperwork event (newest first).
    if (addedCount < 1 || addedCount > 2) {
      failures.push(
        `history grew by ${addedCount} entries, expected 1–2 (paperwork ± status)`,
      );
    } else {
      const newest = afterHistory[0];
      if (newest?.type !== "paperwork") {
        failures.push(`newest history entry type is "${newest?.type}", expected "paperwork"`);
      }
      if (addedCount === 2 && afterHistory[1]?.type !== "status") {
        failures.push(
          `second new history entry type is "${afterHistory[1]?.type}", expected "status"`,
        );
      }
      const preserved = afterHistory.slice(addedCount);
      if (JSON.stringify(preserved) !== JSON.stringify(beforeHistory)) {
        failures.push("existing history entries were modified");
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    changedFields,
    previousStage,
    newStage,
    previousPaperworkStatus,
    newPaperworkStatus,
  };
}

export function diffP221GlobalStore(args: {
  before: Record<string, P221WorkflowSnapshot>;
  after: Record<string, P221WorkflowSnapshot>;
  targetIds: readonly string[];
}): P221GlobalDiff {
  const { before, after, targetIds } = args;
  const targets = new Set(targetIds);
  const targetIdsChanged: string[] = [];
  const nonTargetIdsChanged: string[] = [];
  const recordsAdded: string[] = [];
  const recordsRemoved: string[] = [];

  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    const b = before[id];
    const a = after[id];
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
    }
  }
  return { targetIdsChanged, nonTargetIdsChanged, recordsAdded, recordsRemoved };
}

export function assertP221WriteBudget(plannedWrites: number): void {
  if (plannedWrites > P221_MAX_CANDIDATES) {
    throw new Error(
      `P221 write budget exceeded: planned=${plannedWrites} max=${P221_MAX_CANDIDATES}`,
    );
  }
  if (plannedWrites !== P221_MAX_CANDIDATES) {
    throw new Error(
      `P221 requires exactly ${P221_MAX_CANDIDATES} candidates; planned=${plannedWrites}`,
    );
  }
}

export function assertP221ExactlyTwoSignatureRequests(ids: Array<string | null | undefined>): void {
  const unique = [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (unique.length !== P221_MAX_CANDIDATES) {
    throw new Error(
      `P221 expected exactly ${P221_MAX_CANDIDATES} signature requests, got ${unique.length}`,
    );
  }
}

/** Abort if MEL/Breezy/recruiter write vocabulary appears in a call context. */
export function assertP221NoExternalWrite(context: string): void {
  if (/mel.?write|breezy.?write|assign.?recruiter|reminder.?email|reminder.?job/i.test(context)) {
    throw new Error(`P221 abort: disallowed external write path (${context})`);
  }
}
