/**
 * P186.3 read-only queue validation — no production approval writes.
 *
 * Usage: npx tsx scripts/p186-3-queue-validation.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { LifecycleStateMachine } from "@/lib/p186-1-lifecycle-state-machine";
import { applyP1862Migrations } from "@/lib/p186-2-event-adapters";
import {
  applyP1863Migrations,
  buildOperatorDashboard,
  buildQueueItem,
  canPerformAction,
  canViewQueue,
  classifyQueue,
  previewBulkAction,
  readP1863Flags,
  summarizeQueues,
  type P1863ProductRole,
  type P1863SourceRow,
} from "@/lib/p186-3-operator-lifecycle-queues";

async function main() {
  const pgliteDir = await mkdtemp(path.join(os.tmpdir(), "p1863-val-"));
  process.env.P185_PGLITE_DATA_DIR = pgliteDir;
  process.env.P185_5_FORCE_PGLITE = "1";
  delete process.env.DATABASE_URL;
  delete process.env.P185_DATABASE_URL;
  // Keep all P186.3 flags off except force overrides in dashboard
  delete process.env.P186_OPERATOR_DASHBOARD;
  delete process.env.P186_APPROVAL_ACTIONS;
  delete process.env.P186_BULK_ACTIONS;
  await resetSqlClientCacheForTests();

  const client = await createSqlClient({
    forceNew: true,
    forcePglite: true,
    pgliteDataDir: pgliteDir,
  });
  await applyP1862Migrations(client);
  await applyP1863Migrations(client);

  const sm = new LifecycleStateMachine(client);
  // Seed a small shadow cohort
  await sm.apply({
    candidateId: "val-1",
    toState: "APPLIED",
    actor: "system:test",
    source: "manual_test",
    reason: "validation seed",
  });
  await sm.apply({
    candidateId: "val-1",
    toState: "RECRUITER_REVIEW",
    actor: "system:test",
    source: "manual_test",
    reason: "validation seed",
  });
  await sm.apply({
    candidateId: "val-2",
    toState: "APPLIED",
    actor: "system:test",
    source: "manual_test",
    reason: "validation seed",
  });
  await sm.apply({
    candidateId: "val-2",
    toState: "RECRUITER_REVIEW",
    actor: "system:test",
    source: "manual_test",
    reason: "validation seed",
  });
  await sm.apply({
    candidateId: "val-2",
    toState: "HIRING_RECOMMENDATION",
    actor: "system:test",
    source: "manual_test",
    reason: "validation seed",
  });

  const cohort: P1863SourceRow[] = [
    {
      candidateId: "val-1",
      displayName: "Val One",
      productionState: "Needs Review",
      shadowState: "RECRUITER_REVIEW",
      recruiter: "R1",
      dm: "DM1",
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      candidateId: "val-2",
      displayName: "Val Two",
      productionState: "Qualified",
      shadowState: "HIRING_RECOMMENDATION",
      recruiter: "R1",
      dm: "DM1",
      updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      candidateId: "val-3",
      displayName: "Val Missing Shadow",
      productionState: "Paperwork Needed",
      shadowState: null,
      recruiter: "R2",
      mismatch: false,
    },
    {
      candidateId: "val-4",
      displayName: "Val Mismatch",
      productionState: "Signed",
      shadowState: "PAPERWORK_SENT",
      mismatch: true,
      mismatchKind: "source_state_disagreement",
    },
    {
      candidateId: "val-5",
      displayName: "Val Blocked",
      productionState: "Qualified",
      shadowState: "HIRING_RECOMMENDATION",
      holdFlags: ["executive_hold"],
      blocked: true,
      blockers: ["executive_hold"],
    },
  ];

  const items = cohort.map((r) => buildQueueItem(r));
  const summaries = summarizeQueues(items);
  const dashboard = await buildOperatorDashboard({
    role: "operator",
    workflows: cohort.map((c) => ({
      candidateId: c.candidateId,
      name: c.displayName,
      workflowStatus: c.productionState,
      recruiter: c.recruiter,
      dm: c.dm,
      updatedAt: c.updatedAt,
      holdFlags: c.holdFlags,
      withdrawn: c.withdrawn,
    })),
    client,
    forceFlags: {
      operatorDashboard: true,
      missingShadowReviewQueue: true,
    },
  });

  const approvalReady = items.filter((i) => i.queueId === "waiting_operator_approval").length;
  const blocked = items.filter((i) => i.blocked).length;
  const mismatch = items.filter((i) => i.mismatch || i.queueId === "lifecycle_conflicts").length;
  const missingShadow = items.filter((i) => i.queueId === "missing_shadow").length;

  const roles: P1863ProductRole[] = [
    "executive",
    "operator",
    "recruiter",
    "dm",
    "read_only_viewer",
  ];
  const roleAccess = Object.fromEntries(
    roles.map((role) => [
      role,
      {
        canViewApprovalQueue: canViewQueue(role, "waiting_operator_approval"),
        canApprove: canPerformAction(role, "approve_hiring_recommendation"),
        canBulkHold: canPerformAction(role, "place_hold"),
        canViewOnly: canPerformAction(role, "view") && !canPerformAction(role, "approve_hiring_recommendation"),
      },
    ]),
  );

  const bulkPreview = previewBulkAction({
    action: "approve_hiring_recommendation",
    rows: cohort.filter((c) => classifyQueue(c) === "waiting_operator_approval"),
    operatorAuthorized: true,
  });

  const flags = readP1863Flags();
  const queueValidation = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P186.3",
    readOnly: true,
    productionWritesAttempted: 0,
    productionWritesCompleted: 0,
    flagsDefaultOff: flags,
    queueTotals: Object.fromEntries(summaries.map((s) => [s.queueId, s.count])),
    approvalReadyCount: approvalReady,
    blockedCount: blocked,
    mismatchCount: mismatch,
    missingShadowCount: missingShadow,
    dashboardItemCount: dashboard.items.length,
    bulkPreviewValidation: {
      action: bulkPreview.action,
      eligible: bulkPreview.eligible.length,
      blocked: bulkPreview.blocked.length,
      batchLimit: bulkPreview.batchLimit,
    },
    isolation: dashboard.isolation,
  };

  const rbacValidation = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P186.3",
    roles: roleAccess,
    notes: [
      "Read-only viewer: view/filter only",
      "Recruiter: own-queue visibility + notes/return-for-info",
      "DM: territory queues + hold/return",
      "Operator/Executive: approval + bulk + conflict review",
      "No role may send paperwork via P186",
    ],
  };

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(
    path.join(artifactsDir, "p186-3-queue-validation.json"),
    JSON.stringify(queueValidation, null, 2) + "\n",
  );
  await writeFile(
    path.join(artifactsDir, "p186-3-rbac-validation.json"),
    JSON.stringify(rbacValidation, null, 2) + "\n",
  );

  console.log(JSON.stringify({ queueValidation, rbacValidation }, null, 2));

  await resetSqlClientCacheForTests();
  await rm(pgliteDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
