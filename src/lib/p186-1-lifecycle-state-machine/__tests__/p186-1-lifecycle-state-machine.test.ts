import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  applyP1861Migrations,
  buildLifecycleHealthReport,
  deriveExpectedLifecycleState,
  isLegalTransition,
  LifecycleStateMachine,
  ShadowProjectionEngine,
  validateTransition,
} from "@/lib/p186-1-lifecycle-state-machine";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";

describe("P186.1 lifecycle state machine (shadow)", () => {
  let pgliteDir: string;

  beforeEach(async () => {
    pgliteDir = await mkdtemp(path.join(os.tmpdir(), "p1861-pg-"));
    process.env.P185_PGLITE_DATA_DIR = pgliteDir;
    process.env.P185_5_FORCE_PGLITE = "1";
    delete process.env.P185_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
    await resetSqlClientCacheForTests();
  });

  afterEach(async () => {
    await resetSqlClientCacheForTests();
    delete process.env.P185_PGLITE_DATA_DIR;
    delete process.env.P185_5_FORCE_PGLITE;
    await rm(pgliteDir, { recursive: true, force: true });
  });

  async function machine() {
    const client = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    await applyP1861Migrations(client);
    return { client, fsm: new LifecycleStateMachine(client) };
  }

  it("allows legal happy-path transitions", async () => {
    const { fsm } = await machine();
    const steps = [
      "APPLIED",
      "RECRUITER_REVIEW",
      "HIRING_RECOMMENDATION",
      "OPERATOR_APPROVED",
      "PAPERWORK_NEEDED",
      "PAPERWORK_SENT",
      "SIGNED",
      "ONBOARDING_COMPLETE",
      "READY_FOR_MEL",
      "EXPORTED",
    ] as const;
    for (const step of steps) {
      const r = await fsm.apply({
        candidateId: "c-legal",
        toState: step,
        actor: "system:test",
        source: "manual_test",
        reason: `to ${step}`,
        eventId: `e-${step}`,
      });
      assert.equal(r.applied, true, r.validation.message);
    }
    const rec = await fsm.records.get("c-legal");
    assert.equal(rec?.state, "EXPORTED");
  });

  it("rejects illegal transitions", () => {
    const v = validateTransition({
      fromState: "APPLIED",
      toState: "PAPERWORK_SENT",
    });
    assert.equal(v.ok, false);
    assert.equal(v.code, "illegal_transition");
  });

  it("rejects impossible regressions", () => {
    assert.equal(isLegalTransition("SIGNED", "APPLIED"), false);
    const v = validateTransition({ fromState: "SIGNED", toState: "APPLIED" });
    assert.equal(v.ok, false);
    assert.ok(
      v.code === "illegal_transition" || v.code === "impossible_transition",
    );
  });

  it("deduplicates events", async () => {
    const { fsm } = await machine();
    const first = await fsm.apply({
      candidateId: "c-dup",
      toState: "APPLIED",
      actor: "system:test",
      source: "manual_test",
      reason: "seed",
      eventId: "same-event",
    });
    assert.equal(first.applied, true);
    const second = await fsm.apply({
      candidateId: "c-dup",
      toState: "RECRUITER_REVIEW",
      actor: "system:test",
      source: "manual_test",
      reason: "retry",
      eventId: "same-event",
    });
    assert.equal(second.applied, false);
    assert.equal(second.validation.code, "duplicate_event");
    const rec = await fsm.records.get("c-dup");
    assert.equal(rec?.state, "APPLIED");
  });

  it("persists across restart (Neon/PGlite durability)", async () => {
    {
      const { fsm } = await machine();
      await fsm.apply({
        candidateId: "c-persist",
        toState: "APPLIED",
        actor: "system:test",
        source: "manual_test",
        reason: "seed",
        eventId: "p1",
      });
      await fsm.apply({
        candidateId: "c-persist",
        toState: "RECRUITER_REVIEW",
        actor: "system:test",
        source: "manual_test",
        reason: "review",
        eventId: "p2",
      });
    }
    await resetSqlClientCacheForTests();
    const client = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    const fsm2 = new LifecycleStateMachine(client);
    const rec = await fsm2.records.get("c-persist");
    assert.equal(rec?.state, "RECRUITER_REVIEW");
    assert.equal(rec?.previousState, "APPLIED");
  });

  it("supports audit replay reconstruction", async () => {
    const { fsm } = await machine();
    await fsm.apply({
      candidateId: "c-replay",
      toState: "APPLIED",
      actor: "system:test",
      source: "manual_test",
      reason: "a",
      eventId: "r1",
    });
    await fsm.apply({
      candidateId: "c-replay",
      toState: "RECRUITER_REVIEW",
      actor: "system:test",
      source: "manual_test",
      reason: "b",
      eventId: "r2",
    });
    await fsm.apply({
      candidateId: "c-replay",
      toState: "HIRING_RECOMMENDATION",
      actor: "system:test",
      source: "manual_test",
      reason: "c",
      eventId: "r3",
    });
    const reconstructed = await fsm.audit.reconstructState("c-replay");
    assert.equal(reconstructed, "HIRING_RECOMMENDATION");
    const live = await fsm.records.get("c-replay");
    assert.equal(live?.state, reconstructed);
  });

  it("handles concurrent CAS updates", async () => {
    const { client, fsm } = await machine();
    await fsm.apply({
      candidateId: "c-cas",
      toState: "APPLIED",
      actor: "system:test",
      source: "manual_test",
      reason: "seed",
      eventId: "cas0",
    });
    const current = await fsm.records.get("c-cas");
    assert.ok(current);
    const a = fsm.records.compareAndSet({
      candidateId: "c-cas",
      expectedVersion: current!.version,
      state: "RECRUITER_REVIEW",
      previousState: "APPLIED",
    });
    const b = fsm.records.compareAndSet({
      candidateId: "c-cas",
      expectedVersion: current!.version,
      state: "BLOCKED",
      previousState: "APPLIED",
      blockedReason: "hold",
    });
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(ra.ok !== rb.ok, true, "exactly one CAS winner");
    const winner = await new LifecycleStateMachine(client).records.get("c-cas");
    assert.ok(winner);
    assert.ok(winner.state === "RECRUITER_REVIEW" || winner.state === "BLOCKED");
    assert.equal(winner.version, current!.version + 1);
  });

  it("derives expected states from production snapshots", () => {
    assert.equal(
      deriveExpectedLifecycleState({
        workflowStatus: "Applied",
        paperworkStatus: "not_sent",
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkSignedAt: null,
        signatureRequestId: null,
        recommendedStage: null,
      }),
      "APPLIED",
    );
    assert.equal(
      deriveExpectedLifecycleState({
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "viewed",
        paperworkSentAt: "2026-07-10T00:00:00.000Z",
        paperworkViewedAt: "2026-07-10T01:00:00.000Z",
        paperworkSignedAt: null,
        signatureRequestId: "sig",
        recommendedStage: null,
      }),
      "VIEWED",
    );
    assert.equal(
      deriveExpectedLifecycleState({
        workflowStatus: "Ready for MEL",
        paperworkStatus: "signed",
        paperworkSentAt: "x",
        paperworkViewedAt: "y",
        paperworkSignedAt: "z",
        signatureRequestId: "sig",
        recommendedStage: null,
      }),
      "READY_FOR_MEL",
    );
  });

  it("shadow projection records matches and mismatches", async () => {
    const { client } = await machine();
    const engine = new ShadowProjectionEngine(client);
    const result = await engine.project([
      {
        candidateId: "s1",
        workflowStatus: "Applied",
        paperworkStatus: "not_sent",
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkSignedAt: null,
        signatureRequestId: null,
        recommendedStage: null,
      },
      {
        candidateId: "s2",
        workflowStatus: "Paperwork Needed",
        paperworkStatus: "not_sent",
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkSignedAt: null,
        signatureRequestId: null,
        recommendedStage: null,
        hasOperatorApprovalEvidence: true,
      },
    ]);
    assert.equal(result.evaluated, 2);
    assert.ok(result.matches >= 1);
    assert.equal(result.findings.length, 2);
  });

  it("builds lifecycle health report with isolation flags", async () => {
    const { client } = await machine();
    const engine = new ShadowProjectionEngine(client);
    await engine.project([
      {
        candidateId: "h1",
        workflowStatus: "Applied",
        paperworkStatus: null,
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkSignedAt: null,
        signatureRequestId: null,
        recommendedStage: null,
      },
    ]);
    const report = await buildLifecycleHealthReport(client);
    assert.equal(report.phase, "P186.1");
    assert.equal(report.isolation.paperworkSendDisabled, true);
    assert.equal(report.isolation.continuousAutomationDisabled, true);
    assert.equal(report.isolation.p184P185Unmodified, true);
    assert.equal(report.storage.healthy, true);
    assert.ok(report.shadow.lastProjectedAt);
  });

  it("does not import paperwork send modules (static isolation)", async () => {
    const root = path.join(
      process.cwd(),
      "src/lib/p186-1-lifecycle-state-machine",
    );
    const files = [
      "lifecycleStateMachine.ts",
      "shadowProjection.ts",
      "stores.ts",
      "healthReport.ts",
      "index.ts",
    ];
    for (const file of files) {
      const src = await readFile(path.join(root, file), "utf8");
      assert.equal(src.includes("sendTemplateSignatureRequest"), false);
      assert.equal(src.includes("sendP184Paperwork"), false);
      assert.equal(src.includes("executeOnboardingSend"), false);
      assert.equal(src.includes("p184-autonomous-paperwork-send-engine/sender"), false);
    }
  });

  it("requires reason when entering BLOCKED", () => {
    const v = validateTransition({
      fromState: "APPLIED",
      toState: "BLOCKED",
      blockedReason: null,
    });
    assert.equal(v.ok, false);
    assert.equal(v.code, "blocked_without_reason");
  });
});
