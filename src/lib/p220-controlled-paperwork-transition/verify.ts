import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";
import {
  P220_ALLOWED_CHANGED_FIELDS,
  P220_MAX_CANDIDATES,
  P220_TARGET_STAGE,
  P220_TARGETS,
  type P220CheckResult,
  type P220EligibilityEvidence,
  type P220FieldDiff,
  type P220GlobalDiff,
  type P220PostWriteResult,
  type P220Target,
  type P220WorkflowSnapshot,
} from "@/lib/p220-controlled-paperwork-transition/types";

const BEYOND_PAPERWORK_NEEDED = new Set([
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

export function isP220ApprovedCandidateId(candidateId: string): boolean {
  return P220_TARGETS.some((target) => target.candidateId === candidateId);
}

export function findP220Target(candidateId: string): P220Target | undefined {
  return P220_TARGETS.find((target) => target.candidateId === candidateId);
}

/**
 * Abort if any send / external integration surface is already active or would
 * be implied by the durable record (signature request present, paperwork sent).
 */
export function detectP220SendPathRisk(record: P220WorkflowSnapshot): string[] {
  const failures: string[] = [];
  const paperwork = String(record.paperworkStatus ?? "not_sent");
  if (paperwork !== "not_sent") {
    failures.push(`paperworkStatus is "${paperwork}" — send path must not be reached`);
  }
  if (String(record.signatureRequestId ?? "").trim()) {
    failures.push("signatureRequestId is present — Dropbox Sign path must not execute");
  }
  return failures;
}

export function verifyP220AssignedDm(
  target: P220Target,
  record: P220WorkflowSnapshot | undefined,
): P220CheckResult {
  const failures: string[] = [];
  if (!record) {
    return { ok: false, failures: [`workflow record missing for ${target.candidateId}`] };
  }
  if (record.candidateId !== target.candidateId) {
    failures.push(`candidateId mismatch: record=${record.candidateId}`);
  }
  if (!isP220ApprovedCandidateId(record.candidateId)) {
    failures.push(`candidate ${record.candidateId} is not an approved P220 target`);
  }
  if (String(record.assignedDM ?? "").trim() !== target.expectedDm) {
    failures.push(
      `assignedDM is "${record.assignedDM}", expected "${target.expectedDm}"`,
    );
  }
  return { ok: failures.length === 0, failures };
}

export function verifyP220Eligibility(
  target: P220Target,
  record: P220WorkflowSnapshot,
  evidence: P220EligibilityEvidence,
): P220CheckResult {
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

export function verifyP220PreWrite(
  target: P220Target,
  record: P220WorkflowSnapshot | undefined,
  evidence: P220EligibilityEvidence,
): P220CheckResult {
  const failures: string[] = [];
  if (!isP220ApprovedCandidateId(target.candidateId)) {
    failures.push(`candidate ${target.candidateId} is not an approved P220 target`);
  }
  const dm = verifyP220AssignedDm(target, record);
  failures.push(...dm.failures);
  if (!record) return { ok: false, failures };

  const stage = String(record.workflowStatus ?? "");
  if (BEYOND_PAPERWORK_NEEDED.has(stage)) {
    failures.push(`stage "${stage}" is beyond Paperwork Needed — abort`);
  }

  failures.push(...detectP220SendPathRisk(record));

  const eligibility = verifyP220Eligibility(target, record, evidence);
  failures.push(...eligibility.failures);

  return { ok: failures.length === 0, failures };
}

function diffChangedFields(
  before: P220WorkflowSnapshot,
  after: P220WorkflowSnapshot,
): P220FieldDiff[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: P220FieldDiff[] = [];
  for (const field of fields) {
    if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
      changed.push({ field, allowed: P220_ALLOWED_CHANGED_FIELDS.has(field) });
    }
  }
  return changed;
}

/**
 * Read-back: stage is Paperwork Needed, assignedDM/recruiter/notes/paperwork
 * untouched, and only the stage-only write surface changed.
 */
export function verifyP220PostWrite(args: {
  target: P220Target;
  before: P220WorkflowSnapshot;
  after: P220WorkflowSnapshot;
}): P220PostWriteResult {
  const { target, before, after } = args;
  const failures: string[] = [];
  const changedFields = diffChangedFields(before, after);
  const previousStage = String(before.workflowStatus ?? "");
  const newStage = String(after.workflowStatus ?? "");

  if (newStage !== P220_TARGET_STAGE) {
    failures.push(`new stage is "${newStage}", expected "${P220_TARGET_STAGE}"`);
  }
  if (String(after.assignedDM ?? "") !== target.expectedDm) {
    failures.push(`assignedDM drifted to "${after.assignedDM}"`);
  }
  if (String(after.assignedDM ?? "") !== String(before.assignedDM ?? "")) {
    failures.push("assignedDM must not change under P220");
  }
  if (
    String(after.assignedRecruiter ?? "Unassigned") !==
    String(before.assignedRecruiter ?? "Unassigned")
  ) {
    failures.push("assignedRecruiter must not change under P220");
  }
  if (JSON.stringify(after.notes ?? []) !== JSON.stringify(before.notes ?? [])) {
    failures.push("notes must not change under P220");
  }
  if (String(after.paperworkStatus ?? "not_sent") !== String(before.paperworkStatus ?? "not_sent")) {
    failures.push("paperworkStatus must not change under P220");
  }
  if (String(after.signatureRequestId ?? "") !== String(before.signatureRequestId ?? "")) {
    failures.push("signatureRequestId must not change under P220");
  }

  for (const change of changedFields) {
    if (!change.allowed) {
      failures.push(`disallowed field changed: ${change.field}`);
    }
  }

  const stageChanged = previousStage !== newStage;
  const beforeHistory = before.history ?? [];
  const afterHistory = after.history ?? [];
  const historyChanged = changedFields.some((change) => change.field === "history");

  if (stageChanged) {
    if (!historyChanged) {
      failures.push("stage changed but history was not updated");
    } else if (afterHistory.length !== beforeHistory.length + 1) {
      failures.push(
        `history grew by ${afterHistory.length - beforeHistory.length} entries, expected exactly 1`,
      );
    } else {
      const added = afterHistory[0];
      if (added?.type !== "status") {
        failures.push(`new history entry type is "${added?.type}", expected "status"`);
      }
      if (JSON.stringify(afterHistory.slice(1)) !== JSON.stringify(beforeHistory)) {
        failures.push("existing history entries were modified");
      }
    }
  } else if (historyChanged) {
    // Idempotent affirm at Paperwork Needed must not invent history noise.
    failures.push("history changed without a stage transition");
  }

  failures.push(...detectP220SendPathRisk(after));

  return {
    ok: failures.length === 0,
    failures,
    changedFields,
    previousStage,
    newStage,
  };
}

export function diffP220GlobalStore(args: {
  before: Record<string, P220WorkflowSnapshot>;
  after: Record<string, P220WorkflowSnapshot>;
  targetIds: readonly string[];
}): P220GlobalDiff {
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

export function assertP220WriteBudget(plannedWrites: number): void {
  if (plannedWrites > P220_MAX_CANDIDATES) {
    throw new Error(
      `P220 write budget exceeded: planned=${plannedWrites} max=${P220_MAX_CANDIDATES}`,
    );
  }
}

/** Hard guard used by the persist primitive — never call send APIs from P220. */
export function assertP220NoSendPath(context: string): void {
  if (/dropbox|signature.?request|send.?template|send.?paperwork|send.?email/i.test(context)) {
    throw new Error(`P220 abort: send path reached (${context})`);
  }
}
