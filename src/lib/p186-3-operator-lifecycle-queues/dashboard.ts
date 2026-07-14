import { LifecycleAuditStore, LifecycleRecordStore } from "@/lib/p186-1-lifecycle-state-machine";
import { deriveExpectedLifecycleState } from "@/lib/p186-1-lifecycle-state-machine/states";
import type { P186LifecycleRecord } from "@/lib/p186-1-lifecycle-state-machine/types";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";
import { applyP1863Migrations } from "@/lib/p186-3-operator-lifecycle-queues/audit";
import { readP1863Flags } from "@/lib/p186-3-operator-lifecycle-queues/flags";
import {
  applyQueueFilters,
  type P1863QueueFilters,
} from "@/lib/p186-3-operator-lifecycle-queues/filters";
import {
  buildQueueItem,
  summarizeQueues,
  type P1863SourceRow,
} from "@/lib/p186-3-operator-lifecycle-queues/queues";
import { canViewQueue, listAllowedActions } from "@/lib/p186-3-operator-lifecycle-queues/rbac";
import type {
  P1863CandidateDetail,
  P1863CandidateQueueItem,
  P1863ProductRole,
  P1863QueueId,
  P1863QueueSummary,
} from "@/lib/p186-3-operator-lifecycle-queues/types";
import { P186_3_SOURCE_PHASE } from "@/lib/p186-3-operator-lifecycle-queues/types";

export type WorkflowLike = {
  candidateId: string;
  name?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  state?: string | null;
  recruiter?: string | null;
  dm?: string | null;
  workflowStatus?: string | null;
  paperworkStatus?: string | null;
  paperworkSentAt?: string | null;
  paperworkViewedAt?: string | null;
  paperworkSignedAt?: string | null;
  signatureRequestId?: string | null;
  recommendedStage?: string | null;
  directDepositStatus?: string | null;
  note?: string | null;
  updatedAt?: string | null;
  withdrawn?: boolean;
  archived?: boolean;
  holdFlags?: string[];
  priority?: "high" | "medium" | "low";
};

export type P1863DashboardSnapshot = {
  sourcePhase: typeof P186_3_SOURCE_PHASE;
  generatedAt: string;
  readOnlyDefault: true;
  flags: ReturnType<typeof readP1863Flags>;
  role: P1863ProductRole;
  allowedActions: ReturnType<typeof listAllowedActions>;
  queues: P1863QueueSummary[];
  items: P1863CandidateQueueItem[];
  health: P1863HealthMetrics;
  isolation: {
    p184P185Untouched: true;
    paperworkSendDisabled: true;
    continuousAutomationDisabled: true;
    p186NonAuthoritative: true;
  };
};

export type P1863HealthMetrics = {
  queueCounts: Record<string, number>;
  approvalAgingMs: { oldest: number | null; average: number | null };
  bulkActionSuccessRate: number | null;
  blockedActionCount: number;
  lifecycleMismatchCount: number;
  missingShadowCount: number;
  eventIngestionLagMs: number | null;
  productionWriteFailures: number;
  shadowUpdateLagMs: number | null;
  p184P185IsolationStatus: "isolated";
};

function holdFromNote(note: string | null | undefined): string[] {
  if (!note) return [];
  const flags: string[] = [];
  if (/\[HOLD\]/i.test(note)) flags.push("operator_hold");
  if (/executive hold/i.test(note)) flags.push("executive_hold");
  if (/recruiter hold/i.test(note)) flags.push("recruiter_hold");
  if (/dm hold/i.test(note)) flags.push("dm_hold");
  if (/client hold/i.test(note)) flags.push("client_hold");
  return flags;
}

export function workflowToSourceRow(
  wf: WorkflowLike,
  shadow: P186LifecycleRecord | null,
): P1863SourceRow {
  const derived = deriveExpectedLifecycleState({
    workflowStatus: wf.workflowStatus ?? null,
    paperworkStatus: wf.paperworkStatus ?? null,
    paperworkSentAt: wf.paperworkSentAt ?? null,
    paperworkViewedAt: wf.paperworkViewedAt ?? null,
    paperworkSignedAt: wf.paperworkSignedAt ?? null,
    signatureRequestId: wf.signatureRequestId ?? null,
    recommendedStage: wf.recommendedStage ?? null,
    directDepositStatus: wf.directDepositStatus ?? null,
  });
  const mismatch =
    shadow != null && derived != null && shadow.state !== "BLOCKED"
      ? shadow.state !== derived
      : false;
  const melReady =
    wf.workflowStatus === "Ready for MEL" ||
    shadow?.state === "READY_FOR_MEL" ||
    shadow?.state === "EXPORTED";
  return {
    candidateId: wf.candidateId,
    displayName: wf.name ?? null,
    jobTitle: wf.jobTitle ?? null,
    city: wf.city ?? null,
    state: wf.state ?? null,
    recruiter: wf.recruiter ?? null,
    dm: wf.dm ?? null,
    productionState: wf.workflowStatus ?? null,
    shadowState: shadow?.state ?? null,
    paperworkState: wf.paperworkStatus ?? null,
    onboardingState: wf.directDepositStatus ?? null,
    melReady,
    mismatch,
    mismatchKind: mismatch ? "source_state_disagreement" : null,
    blocked: Boolean(shadow?.blockedReason) || Boolean(wf.withdrawn) || Boolean(wf.archived),
    blockers: [
      ...(shadow?.blockedReason ? [shadow.blockedReason] : []),
      ...(wf.holdFlags ?? []),
      ...holdFromNote(wf.note),
    ],
    priority: wf.priority,
    updatedAt: wf.updatedAt ?? shadow?.updatedAt ?? null,
    sourceSystemState: wf.workflowStatus ?? null,
    withdrawn: wf.withdrawn,
    archived: wf.archived,
    holdFlags: [...(wf.holdFlags ?? []), ...holdFromNote(wf.note)],
  };
}

export function buildRowsFromStores(input: {
  workflows: WorkflowLike[];
  shadows: P186LifecycleRecord[];
}): P1863SourceRow[] {
  const shadowById = new Map(input.shadows.map((s) => [s.candidateId, s]));
  const seen = new Set<string>();
  const rows: P1863SourceRow[] = [];

  for (const wf of input.workflows) {
    seen.add(wf.candidateId);
    rows.push(workflowToSourceRow(wf, shadowById.get(wf.candidateId) ?? null));
  }
  for (const shadow of input.shadows) {
    if (seen.has(shadow.candidateId)) continue;
    rows.push({
      candidateId: shadow.candidateId,
      shadowState: shadow.state,
      productionState: null,
      mismatch: true,
      mismatchKind: "missing_production",
      blocked: Boolean(shadow.blockedReason),
      blockers: shadow.blockedReason ? [shadow.blockedReason] : [],
      updatedAt: shadow.updatedAt,
    });
  }
  return rows;
}

async function loadAuditMetrics(client: SqlClient): Promise<{
  bulkSuccessRate: number | null;
  productionWriteFailures: number;
}> {
  try {
    const bulk = await client.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE action IN (
             'approve_hiring_recommendation','return_to_recruiter','place_hold','remove_hold'
           )
         )::int AS total,
         COUNT(*) FILTER (
           WHERE ok = true AND action IN (
             'approve_hiring_recommendation','return_to_recruiter','place_hold','remove_hold'
           )
         )::int AS ok_n,
         COUNT(*) FILTER (WHERE ok = false)::int AS fail_n
       FROM p186_operator_audit`,
    );
    const row = bulk.rows[0] as { total?: number; ok_n?: number; fail_n?: number } | undefined;
    const total = Number(row?.total ?? 0);
    const okN = Number(row?.ok_n ?? 0);
    const failN = Number(row?.fail_n ?? 0);
    return {
      bulkSuccessRate: total > 0 ? Math.round((okN / total) * 1000) / 10 : null,
      productionWriteFailures: failN,
    };
  } catch {
    return { bulkSuccessRate: null, productionWriteFailures: 0 };
  }
}

export function buildHealthMetrics(input: {
  items: P1863CandidateQueueItem[];
  summaries: P1863QueueSummary[];
  bulkSuccessRate: number | null;
  productionWriteFailures: number;
}): P1863HealthMetrics {
  const approvalQueue = input.items.filter((i) => i.queueId === "waiting_operator_approval");
  const ages = approvalQueue.map((i) => i.ageMs);
  return {
    queueCounts: Object.fromEntries(input.summaries.map((s) => [s.queueId, s.count])),
    approvalAgingMs: {
      oldest: ages.length ? Math.max(...ages) : null,
      average: ages.length
        ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
        : null,
    },
    bulkActionSuccessRate: input.bulkSuccessRate,
    blockedActionCount: input.items.filter((i) => i.blocked).length,
    lifecycleMismatchCount: input.items.filter((i) => i.mismatch || i.queueId === "lifecycle_conflicts")
      .length,
    missingShadowCount: input.items.filter((i) => i.queueId === "missing_shadow").length,
    eventIngestionLagMs: null,
    productionWriteFailures: input.productionWriteFailures,
    shadowUpdateLagMs: null,
    p184P185IsolationStatus: "isolated",
  };
}

export async function buildOperatorDashboard(input: {
  role: P1863ProductRole;
  workflows: WorkflowLike[];
  filters?: P1863QueueFilters;
  client?: SqlClient;
  forceFlags?: Partial<ReturnType<typeof readP1863Flags>>;
}): Promise<P1863DashboardSnapshot> {
  const flags = readP1863Flags(input.forceFlags);
  const db = input.client ?? (await createSqlClient());
  await applyP1863Migrations(db);

  const shadows = await new LifecycleRecordStore(db).listAll();
  const rows = buildRowsFromStores({ workflows: input.workflows, shadows });
  let items = rows.map((r) => buildQueueItem(r));
  items = applyQueueFilters(items, input.filters);
  items = items.filter((item) => canViewQueue(input.role, item.queueId));

  if (!flags.missingShadowReviewQueue) {
    items = items.filter(
      (i) => i.queueId !== "missing_shadow" && i.queueId !== "lifecycle_conflicts",
    );
  }

  const summaries = summarizeQueues(items).filter((s) => canViewQueue(input.role, s.queueId));
  const auditMetrics = await loadAuditMetrics(db);

  return {
    sourcePhase: P186_3_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnlyDefault: true,
    flags,
    role: input.role,
    allowedActions: listAllowedActions(input.role),
    queues: summaries,
    items,
    health: buildHealthMetrics({
      items,
      summaries,
      bulkSuccessRate: auditMetrics.bulkSuccessRate,
      productionWriteFailures: auditMetrics.productionWriteFailures,
    }),
    isolation: {
      p184P185Untouched: true,
      paperworkSendDisabled: true,
      continuousAutomationDisabled: true,
      p186NonAuthoritative: true,
    },
  };
}

export async function buildCandidateDetail(input: {
  candidateId: string;
  workflows: WorkflowLike[];
  client?: SqlClient;
}): Promise<P1863CandidateDetail | null> {
  const db = input.client ?? (await createSqlClient());
  await applyP1863Migrations(db);
  const shadow = await new LifecycleRecordStore(db).get(input.candidateId);
  const wf = input.workflows.find((w) => w.candidateId === input.candidateId);
  const row = workflowToSourceRow(
    wf ?? { candidateId: input.candidateId, workflowStatus: null },
    shadow,
  );
  const item = buildQueueItem(row);

  const history = await new LifecycleAuditStore(db).listForCandidate(input.candidateId, 50);
  const historyDesc = [...history].reverse();
  let notes: Array<{ at: string; actor: string; action: string; detail: string }> = [];
  try {
    const noteRows = await db.query(
      `SELECT at, actor, note, label FROM p186_operator_notes
       WHERE candidate_id = $1 ORDER BY at DESC LIMIT 40`,
      [input.candidateId],
    );
    notes = noteRows.rows.map((r) => ({
      at: String(r.at),
      actor: String(r.actor),
      action: r.label ? `note:${r.label}` : "note",
      detail: String(r.note),
    }));
  } catch {
    notes = [];
  }

  const missingInformation: string[] = [];
  if (!row.recruiter) missingInformation.push("recruiter");
  if (!row.dm) missingInformation.push("dm");
  if (!row.jobTitle) missingInformation.push("job_title");
  if (!row.shadowState) missingInformation.push("shadow_state");

  return {
    ...item,
    lifecycleHistory: history.map((h) => ({
      at: h.at,
      from: h.previousState,
      to: h.newState,
      reason: h.reason || "transition",
    })),
    latestSourceEvent: historyDesc[0]
      ? {
          eventType: historyDesc[0].reason || "lifecycle_transition",
          sourceSystem: String(historyDesc[0].source ?? "p186_shadow"),
          at: historyDesc[0].at,
        }
      : null,
    selectionEvidence: [
      row.productionState ? `production:${row.productionState}` : "production:unknown",
      row.shadowState ? `shadow:${row.shadowState}` : "shadow:missing",
    ],
    auditTrail: notes,
    missingInformation,
  };
}

export function filterItemsByQueue(
  items: P1863CandidateQueueItem[],
  queueId: P1863QueueId,
): P1863CandidateQueueItem[] {
  return items.filter((i) => i.queueId === queueId);
}
