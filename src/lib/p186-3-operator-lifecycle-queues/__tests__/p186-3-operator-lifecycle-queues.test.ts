import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import {
  applyP1863Migrations,
  appendOperatorAudit,
  buildQueueItem,
  buildRedactedExport,
  canPerformAction,
  canViewQueue,
  classifyQueue,
  evaluateApprovalGates,
  executeBulkAction,
  executeConflictReviewAction,
  executeOperatorApprovalAction,
  previewBulkAction,
  readP1863Flags,
  summarizeQueues,
  type P1863SourceRow,
} from "@/lib/p186-3-operator-lifecycle-queues";

describe("P186.3 operator lifecycle queues", () => {
  let pgliteDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of [
      "P186_OPERATOR_DASHBOARD",
      "P186_APPROVAL_ACTIONS",
      "P186_BULK_ACTIONS",
      "P186_MISSING_SHADOW_REVIEW_QUEUE",
      "P186_REDACTED_EXPORTS",
      "P186_BULK_BATCH_LIMIT",
      "P185_PRODUCTION_AUTOMATION_ENABLED",
    ]) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    pgliteDir = await mkdtemp(path.join(os.tmpdir(), "p1863-pg-"));
    process.env.P185_PGLITE_DATA_DIR = pgliteDir;
    process.env.P185_5_FORCE_PGLITE = "1";
    delete process.env.DATABASE_URL;
    delete process.env.P185_DATABASE_URL;
    await resetSqlClientCacheForTests();
  });

  afterEach(async () => {
    await resetSqlClientCacheForTests();
    delete process.env.P185_PGLITE_DATA_DIR;
    delete process.env.P185_5_FORCE_PGLITE;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(pgliteDir, { recursive: true, force: true });
  });

  function row(partial: Partial<P1863SourceRow> & { candidateId: string }): P1863SourceRow {
    return {
      displayName: "Test Candidate",
      productionState: "Qualified",
      shadowState: "HIRING_RECOMMENDATION",
      ...partial,
    };
  }

  it("feature flags default off", () => {
    const flags = readP1863Flags();
    assert.equal(flags.operatorDashboard, false);
    assert.equal(flags.approvalActions, false);
    assert.equal(flags.bulkActions, false);
    assert.equal(flags.missingShadowReviewQueue, false);
    assert.equal(flags.redactedExports, false);
  });

  it("classifies queues", () => {
    assert.equal(classifyQueue(row({ shadowState: null })), "missing_shadow");
    assert.equal(
      classifyQueue(row({ mismatch: true, shadowState: "SIGNED" })),
      "lifecycle_conflicts",
    );
    assert.equal(
      classifyQueue(row({ shadowState: "RECRUITER_REVIEW" })),
      "waiting_recruiter_review",
    );
    assert.equal(
      classifyQueue(row({ shadowState: "HIRING_RECOMMENDATION", productionState: "Applied" })),
      "hiring_recommendation_needed",
    );
    assert.equal(
      classifyQueue(row({ shadowState: "HIRING_RECOMMENDATION", productionState: "Qualified" })),
      "waiting_operator_approval",
    );
    assert.equal(
      classifyQueue(row({ shadowState: "PAPERWORK_SENT", paperworkState: "sent" })),
      "paperwork_sent",
    );
    assert.equal(classifyQueue(row({ shadowState: "VIEWED" })), "paperwork_viewed");
    assert.equal(classifyQueue(row({ shadowState: "SIGNED" })), "paperwork_signed");
    assert.equal(classifyQueue(row({ shadowState: "READY_FOR_MEL" })), "ready_for_mel");
  });

  it("summarizes queue ownership metrics", () => {
    const items = [
      buildQueueItem(row({ candidateId: "a", shadowState: "HIRING_RECOMMENDATION", productionState: "Qualified", updatedAt: new Date(Date.now() - 86400000).toISOString() })),
      buildQueueItem(row({ candidateId: "b", shadowState: null })),
    ];
    const summaries = summarizeQueues(items);
    const approval = summaries.find((s) => s.queueId === "waiting_operator_approval");
    const missing = summaries.find((s) => s.queueId === "missing_shadow");
    assert.equal(approval?.count, 1);
    assert.equal(missing?.count, 1);
  });

  it("enforces role visibility", () => {
    assert.equal(canViewQueue("read_only_viewer", "missing_shadow"), true);
    assert.equal(canViewQueue("recruiter", "waiting_operator_approval"), false);
    assert.equal(canViewQueue("operator", "waiting_operator_approval"), true);
    assert.equal(canViewQueue("dm", "ready_for_mel"), true);
  });

  it("enforces role action authorization", () => {
    assert.equal(canPerformAction("read_only_viewer", "approve_hiring_recommendation"), false);
    assert.equal(canPerformAction("recruiter", "add_note"), true);
    assert.equal(canPerformAction("recruiter", "approve_hiring_recommendation"), false);
    assert.equal(canPerformAction("dm", "place_hold"), true);
    assert.equal(canPerformAction("operator", "approve_hiring_recommendation"), true);
    assert.equal(canPerformAction("executive", "mark_mel_ready_review_approved"), true);
  });

  it("read-only default blocks approval when flag off", async () => {
    const result = await executeOperatorApprovalAction({
      action: "approve_hiring_recommendation",
      row: row({ candidateId: "c1" }),
      actor: "op1",
      role: "operator",
      operatorAuthorized: true,
      deps: {
        upsert: async () => {
          throw new Error("should not write");
        },
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.failed[0]!.reason, /flag is off/i);
  });

  it("single approval success via production upsert only", async () => {
    let wrote = false;
    let observed = false;
    const result = await executeOperatorApprovalAction({
      action: "approve_hiring_recommendation",
      row: row({ candidateId: "c-ok", productionState: "Qualified" }),
      actor: "op1",
      role: "operator",
      operatorAuthorized: true,
      forceFlags: { approvalActions: true },
      deps: {
        upsert: async (input) => {
          wrote = true;
          assert.equal(input.candidateId, "c-ok");
          assert.equal(input.workflowStatus, "Paperwork Needed");
          return {
            candidateId: "c-ok",
            workflowStatus: "Paperwork Needed",
            paperworkStatus: "not_sent",
          } as never;
        },
        observe: async () => {
          observed = true;
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(wrote, true);
    assert.equal(observed, true);
    assert.equal(result.shadowObservationTriggered, true);
  });

  it("blocks approval on stale production state", async () => {
    const gates = evaluateApprovalGates({
      action: "approve_hiring_recommendation",
      row: row({ candidateId: "c2", productionState: "Signed" }),
      expectedProductionStates: ["Qualified", "Needs Review"],
      operatorAuthorized: true,
    });
    assert.equal(gates.ok, false);
    if (!gates.ok) {
      assert.ok(gates.failures.some((f) => f.code === "stale_production_state"));
    }
  });

  it("prevents duplicate approval", () => {
    const gates = evaluateApprovalGates({
      action: "approve_hiring_recommendation",
      row: row({ candidateId: "c3" }),
      operatorAuthorized: true,
      alreadyApproved: true,
    });
    assert.equal(gates.ok, false);
    if (!gates.ok) assert.ok(gates.failures.some((f) => f.code === "duplicate_approval"));
  });

  it("blocks withdrawn candidates", () => {
    const gates = evaluateApprovalGates({
      action: "approve_hiring_recommendation",
      row: row({ candidateId: "c4", withdrawn: true }),
      operatorAuthorized: true,
    });
    assert.equal(gates.ok, false);
    if (!gates.ok) assert.ok(gates.failures.some((f) => f.code === "withdrawn"));
  });

  it("blocks hold conflicts", () => {
    const gates = evaluateApprovalGates({
      action: "approve_hiring_recommendation",
      row: row({ candidateId: "c5", holdFlags: ["executive_hold"] }),
      operatorAuthorized: true,
    });
    assert.equal(gates.ok, false);
    if (!gates.ok) assert.ok(gates.failures.some((f) => f.code === "hold_conflict"));
  });

  it("bulk preview and batch-size limit", () => {
    process.env.P186_BULK_BATCH_LIMIT = "2";
    const rows = [
      row({ candidateId: "b1", productionState: "Qualified" }),
      row({ candidateId: "b2", productionState: "Qualified" }),
      row({ candidateId: "b3", productionState: "Qualified" }),
    ];
    const preview = previewBulkAction({
      action: "approve_hiring_recommendation",
      rows,
      operatorAuthorized: true,
      batchLimit: 2,
    });
    assert.equal(preview.truncated, true);
    assert.equal(preview.eligible.length + preview.blocked.length, 2);
  });

  it("bulk partial success", async () => {
    const rows = [
      row({ candidateId: "ok1", productionState: "Qualified" }),
      row({ candidateId: "bad1", productionState: "Signed", withdrawn: true }),
    ];
    let writes = 0;
    const result = await executeBulkAction({
      action: "approve_hiring_recommendation",
      rows,
      actor: "op1",
      role: "operator",
      operatorAuthorized: true,
      confirmed: true,
      forceFlags: { bulkActions: true, approvalActions: true },
      deps: {
        upsert: async (input) => {
          writes += 1;
          return {
            candidateId: input.candidateId,
            workflowStatus: "Paperwork Needed",
            paperworkStatus: "not_sent",
          } as never;
        },
        observe: async () => undefined,
      },
    });
    assert.equal(writes, 1);
    assert.deepEqual(result.succeeded, ["ok1"]);
    assert.ok(result.failed.some((f) => f.candidateId === "bad1"));
    assert.match(result.detail, /Partial success|failed/i);
  });

  it("persists operator audit", async () => {
    const client = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    await applyP1863Migrations(client);
    const id = await appendOperatorAudit({
      actor: "op1",
      role: "operator",
      action: "add_note",
      candidateIds: ["c1"],
      correlationId: "corr-1",
      ok: true,
      detail: "note",
      succeeded: ["c1"],
      failed: [],
      client,
    });
    assert.ok(id.startsWith("opa-"));
    const rows = await client.query(`SELECT * FROM p186_operator_audit WHERE id = $1`, [id]);
    assert.equal(rows.rowCount, 1);
  });

  it("missing-shadow review actions do not mutate production", async () => {
    const result = await executeConflictReviewAction({
      action: "request_reconciliation",
      candidateIds: ["m1"],
      actor: "op1",
      role: "operator",
      forceFlags: { missingShadowReviewQueue: true },
    });
    assert.equal(result.ok, true);
    assert.equal(result.productionEventIds.length, 0);
    assert.equal(result.shadowObservationTriggered, false);
  });

  it("production write failure isolates shadow (no observe)", async () => {
    let observed = false;
    const result = await executeOperatorApprovalAction({
      action: "approve_hiring_recommendation",
      row: row({ candidateId: "fail1", productionState: "Qualified" }),
      actor: "op1",
      role: "operator",
      operatorAuthorized: true,
      forceFlags: { approvalActions: true },
      deps: {
        upsert: async () => {
          throw new Error("db down");
        },
        observe: async () => {
          observed = true;
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(observed, false);
    assert.match(result.detail, /no shadow mutation/i);
  });

  it("does not import paperwork send modules", async () => {
    const dir = path.join(
      process.cwd(),
      "src/lib/p186-3-operator-lifecycle-queues",
    );
    const files = [
      "approvalActions.ts",
      "bulkActions.ts",
      "index.ts",
      "dashboard.ts",
      "conflictReview.ts",
    ];
    for (const f of files) {
      const text = await readFile(path.join(dir, f), "utf8");
      assert.equal(/p184-controlled|p185-.*send|sendPaperwork|dropbox-sign-send/i.test(text), false);
    }
  });

  it("redacted export respects flag", () => {
    const item = buildQueueItem(row({ candidateId: "exp1" }));
    const off = buildRedactedExport([item]);
    assert.equal(off.ok, false);
    const on = buildRedactedExport([item], true);
    assert.equal(on.ok, true);
    assert.ok(!on.rows[0]!.candidateIdHash.includes("exp1"));
  });

  it("no direct lifecycle mutation helpers exported for approvals", async () => {
    const mod = await import("@/lib/p186-3-operator-lifecycle-queues");
    assert.equal("LifecycleStateMachine" in mod, false);
    assert.ok(typeof mod.executeOperatorApprovalAction === "function");
  });
});
