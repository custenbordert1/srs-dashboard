import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import {
  assignSeverity,
  buildConflictDashboard,
  buildFreezePlan,
  buildOwnershipMatrix,
  buildRollbackPlanSummary,
  buildSchedulerCollisionReport,
  detectDirectMutations,
  detectDuplicateWriters,
  detectMissingAudit,
  detectMissingIdempotency,
  detectSchedulerOverlaps,
  detectStaleLegacyWriters,
  P1864_WRITER_REGISTRY,
  readP1864Flags,
  reconcileCandidateSources,
  REQUIRED_INVENTORY_WRITER_IDS,
  runShadowLifecycleReconciler,
  runWriterConflictDetection,
} from "@/lib/p186-4-lifecycle-reconciler";

describe("P186.4 lifecycle reconciler + duplicate-writer freeze", () => {
  it("feature flags default off", () => {
    delete process.env.P186_WRITER_INVENTORY_REPORT;
    delete process.env.P186_CONFLICT_DASHBOARD;
    delete process.env.P186_RECONCILER_EXECUTION;
    delete process.env.P186_SCHEDULER_COLLISION_ANALYSIS;
    const flags = readP1864Flags();
    assert.equal(flags.writerInventoryReport, false);
    assert.equal(flags.conflictDashboard, false);
    assert.equal(flags.reconcilerExecution, false);
    assert.equal(flags.schedulerCollisionAnalysis, false);
  });

  it("writer inventory completeness for required phases", () => {
    const ids = new Set(P1864_WRITER_REGISTRY.map((w) => w.writerId));
    for (const required of REQUIRED_INVENTORY_WRITER_IDS) {
      assert.ok(ids.has(required), `missing writer ${required}`);
    }
    assert.ok(P1864_WRITER_REGISTRY.length >= 30);
  });

  it("maps transition ownership", () => {
    const matrix = buildOwnershipMatrix();
    assert.ok(matrix.length >= 8);
    const send = matrix.find((c) => c.transition === "Paperwork Needed→Paperwork Sent");
    assert.ok(send);
    assert.equal(send!.ownership, "multiple");
    assert.ok(send!.writers.includes("p184-autonomous-paperwork-send-engine"));
  });

  it("detects duplicate writers", () => {
    const dups = detectDuplicateWriters();
    assert.ok(dups.some((d) => d.kind === "duplicate_writer"));
    assert.ok(dups.some((d) => d.transition === "paperwork_send"));
    assert.ok(dups.some((d) => d.transition === "continuous_orchestration"));
  });

  it("detects scheduler overlaps", () => {
    const overlaps = detectSchedulerOverlaps();
    assert.ok(overlaps.length >= 1);
    assert.ok(overlaps.every((o) => o.kind === "scheduler_overlap"));
  });

  it("detects direct mutations and missing idempotency/audit", () => {
    assert.ok(detectDirectMutations().length >= 1);
    assert.ok(detectMissingIdempotency().length >= 1);
    // audit gaps may be zero if all production writers have partial/yes
    assert.ok(Array.isArray(detectMissingAudit()));
    assert.ok(detectStaleLegacyWriters().length >= 1);
  });

  it("reconciler compares sources and assigns severity", () => {
    const findings = reconcileCandidateSources({
      candidateId: "c1",
      breezyState: "Applied",
      productionWorkflowState: "Paperwork Needed",
      operatorApprovalState: "approved",
      paperworkEngineState: "signed",
      dropboxSignState: "signed",
      onboardingState: null,
      readyForMelState: null,
      melExportState: null,
      shadowLifecycleState: "PAPERWORK_NEEDED",
    });
    assert.ok(findings.some((f) => f.severity === "high" || f.severity === "critical"));
    assert.equal(assignSeverity(findings[0]!), findings[0]!.severity);
  });

  it("reconciler respects flag and never mutates", () => {
    const off = runShadowLifecycleReconciler({
      cohort: [
        {
          candidateId: "x",
          breezyState: null,
          productionWorkflowState: "Signed",
          operatorApprovalState: null,
          paperworkEngineState: "signed",
          dropboxSignState: "signed",
          onboardingState: null,
          readyForMelState: null,
          melExportState: null,
          shadowLifecycleState: null,
        },
      ],
    });
    assert.equal(off.ok, false);
    assert.equal(off.productionMutations, 0);

    const on = runShadowLifecycleReconciler({
      cohort: [
        {
          candidateId: "x",
          breezyState: null,
          productionWorkflowState: "Signed",
          operatorApprovalState: null,
          paperworkEngineState: "signed",
          dropboxSignState: "signed",
          onboardingState: null,
          readyForMelState: null,
          melExportState: null,
          shadowLifecycleState: null,
        },
      ],
      forceFlags: { reconcilerExecution: true },
    });
    assert.equal(on.ok, true);
    assert.equal(on.productionMutations, 0);
    assert.equal(on.paperworkSends, 0);
    assert.equal(on.melWrites, 0);
    assert.equal(on.readOnly, true);
  });

  it("generates freeze and rollback plans without disabling", () => {
    const plan = buildFreezePlan();
    assert.ok(plan.length >= 3);
    assert.ok(plan.every((p) => p.disabledNow === false));
    assert.ok(plan.some((p) => p.writerId.includes("p154") || p.writerId.includes("p169") || p.writerId.includes("p171")));
    const rollback = buildRollbackPlanSummary(plan);
    assert.ok(rollback.items.length === plan.length);
    assert.match(rollback.note, /does not disable/i);
  });

  it("read-only conflict dashboard output", () => {
    const dash = buildConflictDashboard({
      forceFlags: {
        writerInventoryReport: true,
        conflictDashboard: true,
        reconcilerExecution: true,
        schedulerCollisionAnalysis: true,
      },
      cohort: [
        {
          candidateId: "d1",
          breezyState: "Qualified",
          productionWorkflowState: "Qualified",
          operatorApprovalState: null,
          paperworkEngineState: null,
          dropboxSignState: null,
          onboardingState: null,
          readyForMelState: null,
          melExportState: null,
          shadowLifecycleState: "HIRING_RECOMMENDATION",
        },
      ],
    });
    assert.equal(dash.readOnly, true);
    assert.ok(dash.summary.totalWriters >= 30);
    assert.ok(dash.findings.length >= 1);
    assert.ok(dash.freezeOrder.length >= 1);
  });

  it("scheduler collision report recommends cadence but does not enable", () => {
    const report = buildSchedulerCollisionReport();
    assert.equal(report.recommendedCadence.enabledNow, false);
    assert.ok(report.schedulers.length >= 5);
  });

  it("conflict detection aggregates findings", () => {
    const all = runWriterConflictDetection();
    assert.ok(all.some((f) => f.kind === "duplicate_writer"));
    assert.ok(all.some((f) => f.kind === "stale_legacy_writer"));
  });

  it("does not import P184/P185 send APIs", async () => {
    const dir = path.join(process.cwd(), "src/lib/p186-4-lifecycle-reconciler");
    const files = [
      "index.ts",
      "reconciler.ts",
      "freezePlan.ts",
      "conflictDashboard.ts",
      "detectors.ts",
      "schedulerCollision.ts",
      "flags.ts",
    ];
    for (const f of files) {
      const text = await readFile(path.join(dir, f), "utf8");
      assert.equal(
        /from\s+["']@\/lib\/p184|from\s+["']@\/lib\/p185-|import\s+.*executeOnboardingSend|import\s+.*runP184/i.test(
          text,
        ),
        false,
        `unexpected send import in ${f}`,
      );
      assert.equal(/P185_PRODUCTION_AUTOMATION_ENABLED\s*=\s*["']1["']/.test(text), false);
    }
  });

  it("registry does not claim to disable production writers", () => {
    for (const w of P1864_WRITER_REGISTRY) {
      assert.notEqual(w.retirementRecommendation, undefined);
    }
    const plan = buildFreezePlan();
    assert.ok(plan.every((p) => p.disabledNow === false));
  });
});
