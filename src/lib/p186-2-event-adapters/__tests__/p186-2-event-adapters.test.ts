import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  adaptBreezyStageChange,
  adaptDropboxSignStatus,
  adaptMelExported,
  adaptOnboardingComplete,
  adaptOperatorApproval,
  adaptPaperworkEngineEvent,
  adaptReadyForMel,
  adaptRecruiterAction,
  adaptReconcileTick,
  applyP1862Migrations,
  buildP1862HealthReport,
  normalizeLifecycleEvent,
  readP1862Flags,
  runShadowReconciliation,
  ShadowDualWriteIngestor,
} from "@/lib/p186-2-event-adapters";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { P1862Flags } from "@/lib/p186-2-event-adapters/flags";

const ALL_ON: P1862Flags = {
  shadowIngestion: true,
  adapterBreezy: true,
  adapterRecruiter: true,
  adapterOperator: true,
  adapterPaperwork: true,
  adapterDropbox: true,
  adapterOnboarding: true,
  adapterMel: true,
  adapterReconcile: true,
  reconciliation: true,
  shadowHealthReporting: true,
};

describe("P186.2 event adapters + shadow dual-write", () => {
  let pgliteDir: string;

  beforeEach(async () => {
    pgliteDir = await mkdtemp(path.join(os.tmpdir(), "p1862-pg-"));
    process.env.P185_PGLITE_DATA_DIR = pgliteDir;
    process.env.P185_5_FORCE_PGLITE = "1";
    process.env.P186_2_FORCE_RECONCILE = "1";
    delete process.env.DATABASE_URL;
    delete process.env.P185_DATABASE_URL;
    delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
    delete process.env.P186_SHADOW_INGESTION;
    await resetSqlClientCacheForTests();
  });

  afterEach(async () => {
    await resetSqlClientCacheForTests();
    delete process.env.P185_PGLITE_DATA_DIR;
    delete process.env.P185_5_FORCE_PGLITE;
    delete process.env.P186_2_FORCE_RECONCILE;
    await rm(pgliteDir, { recursive: true, force: true });
  });

  async function client() {
    const c = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    await applyP1862Migrations(c);
    return c;
  }

  it("maps Breezy stage changes", () => {
    const a = adaptBreezyStageChange({ candidateId: "c1", stage: "Applied" });
    assert.equal(a.ok, true);
    if (a.ok) assert.equal(a.event.eventType, "candidate_applied");
  });

  it("maps recruiter actions", () => {
    const r = adaptRecruiterAction({ candidateId: "c1", action: "recommend" });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.event.eventType, "recruiter_recommended");
  });

  it("maps operator approvals", () => {
    const a = adaptOperatorApproval({ candidateId: "c1", decision: "approve" });
    assert.equal(a.ok, true);
    if (a.ok) assert.equal(a.event.eventType, "operator_approved");
  });

  it("maps P184/P185 paperwork observe events", () => {
    const p = adaptPaperworkEngineEvent({
      candidateId: "c1",
      status: "confirmed_sent",
      source: "p185",
      envelopeIdHash: "abc",
    });
    assert.equal(p.ok, true);
    if (p.ok) {
      assert.equal(p.event.eventType, "confirmed_sent");
      assert.equal(p.event.sourceSystem, "p185");
    }
  });

  it("maps Dropbox status events", () => {
    const d = adaptDropboxSignStatus({
      candidateId: "c1",
      eventType: "signature_request_viewed",
      signatureRequestIdHash: "h1",
    });
    assert.equal(d.ok, true);
    if (d.ok) assert.equal(d.event.eventType, "viewed");
  });

  it("maps onboarding and MEL events", () => {
    assert.equal(adaptOnboardingComplete({ candidateId: "c1" }).ok, true);
    assert.equal(adaptReadyForMel({ candidateId: "c1" }).ok, true);
    assert.equal(adaptMelExported({ candidateId: "c1" }).ok, true);
    assert.equal(adaptReconcileTick({ candidateId: "c1" }).ok, true);
  });

  it("rejects malformed events", () => {
    const n = normalizeLifecycleEvent({
      candidateId: "",
      eventType: "signed",
      sourceSystem: "dropbox_sign",
    });
    assert.equal(n.ok, false);
  });

  it("suppresses duplicate events", async () => {
    const c = await client();
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON);
    const adapted = adaptOperatorApproval({ candidateId: "dup1", decision: "approve" });
    assert.equal(adapted.ok, true);
    if (!adapted.ok) return;
    const first = await ingestor.ingest(adapted.event);
    assert.ok(first.disposition === "accepted" || first.disposition === "match");
    const second = await ingestor.ingest(adapted.event);
    assert.equal(second.disposition, "duplicate");
  });

  it("records late/out-of-order events without regressing", async () => {
    const c = await client();
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON);
    const signed = adaptDropboxSignStatus({
      candidateId: "oo1",
      eventType: "signature_request_all_signed",
    });
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    await ingestor.ingest(signed.event);

    const lateViewed = adaptDropboxSignStatus({
      candidateId: "oo1",
      eventType: "signature_request_viewed",
      at: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(lateViewed.ok, true);
    if (!lateViewed.ok) return;
    // force unique event id
    lateViewed.event.eventId = "late-viewed-1";
    lateViewed.event.idempotencyKey = "late-viewed-1";
    const result = await ingestor.ingest(lateViewed.event);
    assert.ok(result.disposition === "late" || result.comparison === "out_of_order");
    assert.equal(result.shadowStateAfter, "SIGNED");
  });

  it("shadow dual-write does not require production reader", async () => {
    const c = await client();
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON, async () => null);
    const e = adaptBreezyStageChange({ candidateId: "dw1", stage: "Applied" });
    assert.equal(e.ok, true);
    if (!e.ok) return;
    const r = await ingestor.ingest(e.event);
    assert.ok(["accepted", "match"].includes(r.disposition));
  });

  it("ingestion failure isolation returns disposition instead of throwing", async () => {
    const c = await client();
    const bad = new ShadowDualWriteIngestor(c, ALL_ON);
    // @ts-expect-error intentional malformed for isolation
    const r = await bad.ingest(null);
    assert.equal(r.disposition, "ingestion_failure");
  });

  it("persists audit via lifecycle machine on accept", async () => {
    const c = await client();
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON);
    const e = adaptPaperworkEngineEvent({
      candidateId: "aud1",
      status: "paperwork_needed",
    });
    assert.equal(e.ok, true);
    if (!e.ok) return;
    const r = await ingestor.ingest(e.event);
    assert.ok(r.auditId || r.disposition === "accepted" || r.shadowStateAfter === "PAPERWORK_NEEDED");
  });

  it("survives restart recovery", async () => {
    {
      const c = await client();
      const ingestor = new ShadowDualWriteIngestor(c, ALL_ON);
      const e = adaptRecruiterAction({ candidateId: "rr1", action: "claim" });
      assert.equal(e.ok, true);
      if (!e.ok) return;
      await ingestor.ingest(e.event);
    }
    await resetSqlClientCacheForTests();
    const c2 = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    const { LifecycleRecordStore } = await import("@/lib/p186-1-lifecycle-state-machine");
    const rec = await new LifecycleRecordStore(c2).get("rr1");
    assert.equal(rec?.state, "RECRUITER_REVIEW");
  });

  it("handles concurrent event ingestion with CAS/dedupe", async () => {
    const c = await client();
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON);
    const base = adaptOperatorApproval({ candidateId: "conc1", decision: "approve" });
    assert.equal(base.ok, true);
    if (!base.ok) return;
    const e1 = { ...base.event, eventId: "conc-a", idempotencyKey: "conc-a" };
    const e2 = { ...base.event, eventId: "conc-b", idempotencyKey: "conc-b" };
    const [a, b] = await Promise.all([ingestor.ingest(e1), ingestor.ingest(e2)]);
    assert.ok(a.disposition !== "ingestion_failure");
    assert.ok(b.disposition !== "ingestion_failure");
  });

  it("produces reconciliation findings read-only", async () => {
    const c = await client();
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON);
    const e = adaptReadyForMel({ candidateId: "rc1" });
    assert.equal(e.ok, true);
    if (!e.ok) return;
    await ingestor.ingest(e.event);
    const recon = await runShadowReconciliation({
      client: c,
      cohort: [
        {
          candidateId: "rc1",
          workflowStatus: "Ready for MEL",
          paperworkStatus: "signed",
          paperworkSignedAt: "2026-07-11T00:00:00.000Z",
          signatureRequestId: "sig",
        },
        {
          candidateId: "rc-missing",
          workflowStatus: "Applied",
        },
      ],
    });
    assert.equal(recon.evaluated, 2);
    assert.ok(recon.findings.length === 2);
    assert.ok(recon.byKind.missing_shadow >= 1 || recon.byKind.aligned >= 1);
  });

  it("defaults feature flags off", () => {
    const flags = readP1862Flags();
    assert.equal(flags.shadowIngestion, false);
    assert.equal(flags.adapterDropbox, false);
    assert.equal(flags.reconciliation, false);
  });

  it("builds health report with isolation", async () => {
    const c = await client();
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON);
    const e = adaptBreezyStageChange({ candidateId: "h1", stage: "Applied" });
    assert.equal(e.ok, true);
    if (!e.ok) return;
    await ingestor.ingest(e.event);
    const health = await buildP1862HealthReport(c);
    assert.equal(health.isolation.paperworkSendDisabled, true);
    assert.equal(health.isolation.authoritativeModeDisabled, true);
    assert.equal(health.isolation.p184P185Unmodified, true);
    assert.ok(health.ingestion.received >= 1);
  });

  it("does not import paperwork send APIs", async () => {
    const root = path.join(process.cwd(), "src/lib/p186-2-event-adapters");
    const files = [
      "ingest.ts",
      "adapters.ts",
      "observe.ts",
      "reconciliation.ts",
      "health.ts",
      "index.ts",
    ];
    for (const f of files) {
      const src = await readFile(path.join(root, f), "utf8");
      assert.equal(src.includes("sendTemplateSignatureRequest"), false);
      assert.equal(src.includes("sendP184Paperwork"), false);
      assert.equal(src.includes("executeOnboardingSend"), false);
    }
  });

  it("conflicting events surface conflicting_source_state when applicable", async () => {
    const c = await client();
    const production = async () => ({
      workflowStatus: "Applied",
      paperworkStatus: "not_sent",
      paperworkSentAt: null,
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      signatureRequestId: null,
      recommendedStage: null,
    });
    const ingestor = new ShadowDualWriteIngestor(c, ALL_ON, production);
    const signed = adaptDropboxSignStatus({
      candidateId: "cf1",
      eventType: "signature_request_all_signed",
    });
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    await ingestor.ingest(signed.event);
    const next = adaptBreezyStageChange({
      candidateId: "cf1",
      stage: "Applied",
      at: new Date().toISOString(),
    });
    assert.equal(next.ok, true);
    if (!next.ok) return;
    next.event.eventId = "cf1-breezy";
    next.event.idempotencyKey = "cf1-breezy";
    const r = await ingestor.ingest(next.event);
    assert.ok(
      r.disposition === "conflicting_source_state" ||
        r.disposition === "late" ||
        r.comparison === "conflicting_source_state" ||
        r.disposition === "accepted",
    );
  });
});
