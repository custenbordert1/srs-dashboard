import {
  P219_ALLOWED_CHANGED_FIELDS,
  P219_MAX_CANDIDATES,
  type P219CheckResult,
  type P219FieldDiff,
  type P219GlobalDiff,
  type P219PostWriteResult,
  type P219PreviewDecision,
  type P219Target,
  type P219WorkflowSnapshot,
} from "@/lib/p219-controlled-live-dm-assignment/types";

export function isP219Unassigned(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  return !normalized || /^unassigned$/i.test(normalized);
}

const INACTIVE_WORKFLOW_STAGES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);
const ARCHIVED_STAGES = new Set(["archived", "disqualified", "withdrawn", "rejected"]);

export function isP219WorkflowActive(stage: string): boolean {
  return !INACTIVE_WORKFLOW_STAGES.has(stage.trim());
}

export function isP219Archived(stage: string): boolean {
  return ARCHIVED_STAGES.has(stage.trim().toLowerCase());
}

/**
 * Part 1 — the frozen target set must match the P218 preview exactly:
 * same candidate, same position, same Position.Location, same expected DM,
 * and P218 must have concluded `would_assign`.
 */
export function verifyP219TargetAgainstPreview(
  target: P219Target,
  preview: P219PreviewDecision | undefined,
): P219CheckResult {
  const failures: string[] = [];
  if (!preview) {
    return { ok: false, failures: [`no P218 preview decision found for ${target.candidateId}`] };
  }
  if (preview.candidateId !== target.candidateId) {
    failures.push(`candidateId mismatch: preview=${preview.candidateId} target=${target.candidateId}`);
  }
  if (preview.action !== "would_assign") {
    failures.push(`P218 action is ${preview.action}, expected would_assign`);
  }
  if ((preview.expectedAssignedDm ?? "").trim() !== target.expectedDm) {
    failures.push(
      `expected DM mismatch: preview=${preview.expectedAssignedDm ?? "null"} target=${target.expectedDm}`,
    );
  }
  if ((preview.positionId ?? "").trim() !== target.expectedPositionId) {
    failures.push(
      `positionId mismatch: preview=${preview.positionId ?? "null"} target=${target.expectedPositionId}`,
    );
  }
  const loc = preview.positionLocation;
  if (!loc || loc.city !== target.expectedCity || loc.state !== target.expectedState) {
    failures.push(
      `Position.Location mismatch: preview=${loc ? `${loc.city}, ${loc.state}` : "null"} target=${target.expectedCity}, ${target.expectedState}`,
    );
  }
  if (!isP219Unassigned(preview.currentAssignedDm)) {
    failures.push(`preview currentAssignedDm was ${preview.currentAssignedDm}, expected Unassigned`);
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Part 2 — pre-write safety verification against the live workflow record.
 * Any failure aborts before a single byte is written.
 */
export function verifyP219PreWrite(
  target: P219Target,
  record: P219WorkflowSnapshot | undefined,
): P219CheckResult {
  const failures: string[] = [];
  if (!record) {
    return { ok: false, failures: [`workflow record missing for ${target.candidateId}`] };
  }
  if (record.candidateId !== target.candidateId) {
    failures.push(`candidateId mismatch: record=${record.candidateId}`);
  }
  if (!isP219Unassigned(record.assignedDM)) {
    failures.push(`assignedDM is already "${record.assignedDM}", expected null/Unassigned`);
  }
  const stage = String(record.workflowStatus ?? "");
  if (!isP219WorkflowActive(stage)) {
    failures.push(`workflow stage "${stage}" is inactive`);
  }
  if (isP219Archived(stage)) {
    failures.push(`candidate is archived (stage "${stage}")`);
  }
  return { ok: failures.length === 0, failures };
}

function diffChangedFields(
  before: P219WorkflowSnapshot,
  after: P219WorkflowSnapshot,
): P219FieldDiff[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: P219FieldDiff[] = [];
  for (const field of fields) {
    if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
      changed.push({ field, allowed: P219_ALLOWED_CHANGED_FIELDS.has(field) });
    }
  }
  return changed;
}

/**
 * Part 4 — read-back verification: assignedDM persisted with the expected DM,
 * and nothing outside the assignedDM-only upsert surface changed. The history
 * change must be exactly one prepended "assignment" event.
 */
export function verifyP219PostWrite(args: {
  target: P219Target;
  before: P219WorkflowSnapshot;
  after: P219WorkflowSnapshot;
}): P219PostWriteResult {
  const { target, before, after } = args;
  const failures: string[] = [];
  const changedFields = diffChangedFields(before, after);

  if (after.assignedDM !== target.expectedDm) {
    failures.push(`assignedDM after write is "${after.assignedDM}", expected "${target.expectedDm}"`);
  }
  for (const change of changedFields) {
    if (!change.allowed) {
      failures.push(`disallowed field changed: ${change.field}`);
    }
  }

  const beforeHistory = before.history ?? [];
  const afterHistory = after.history ?? [];
  const historyChanged = changedFields.some((change) => change.field === "history");
  if (historyChanged) {
    if (afterHistory.length !== beforeHistory.length + 1) {
      failures.push(
        `history grew by ${afterHistory.length - beforeHistory.length} entries, expected exactly 1`,
      );
    } else {
      const added = afterHistory[0];
      if (added?.type !== "assignment") {
        failures.push(`new history entry type is "${added?.type}", expected "assignment"`);
      }
      const tail = JSON.stringify(afterHistory.slice(1));
      if (tail !== JSON.stringify(beforeHistory)) {
        failures.push("existing history entries were modified");
      }
    }
  }

  return { ok: failures.length === 0, failures, changedFields };
}

/**
 * Part 6 — global audit: diff the whole store before/after and split changed
 * record ids into target vs non-target.
 */
export function diffP219GlobalStore(args: {
  before: Record<string, P219WorkflowSnapshot>;
  after: Record<string, P219WorkflowSnapshot>;
  targetIds: readonly string[];
}): P219GlobalDiff {
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

/** Hard cap: P219 may never plan more than two writes. */
export function assertP219WriteBudget(plannedWrites: number): void {
  if (plannedWrites > P219_MAX_CANDIDATES) {
    throw new Error(
      `P219 write budget exceeded: planned=${plannedWrites} max=${P219_MAX_CANDIDATES}`,
    );
  }
}
