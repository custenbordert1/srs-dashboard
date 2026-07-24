import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import {
  applyP1865Migrations,
  appendP1865Audit,
  buildMelExportPreview,
  buildOnboardingChecklist,
  canPerformP1865Action,
  classifyOnboardingReadiness,
  enqueueMelExportItem,
  executePostSignReviewAction,
  isViewedOrSentOnly,
  listAllowedShadowTransitions,
  proposeShadowTransition,
  readP1865Flags,
  reconcilePostSignAndMel,
  resolvePostSignEvent,
  verifySignedPaperwork,
} from "@/lib/p186-5-post-sign-mel-queue";
import type { P1865PostSignEvent } from "@/lib/p186-5-post-sign-mel-queue/types";

function signedEvent(partial: Partial<P1865PostSignEvent> = {}): P1865PostSignEvent {
  return {
    eventId: "e1",
    candidateId: "cand-1",
    envelopeId: "env-1",
    rolloutOrSendId: "send-1",
    onboardingAssignmentId: "oa-1",
    jobOrProjectId: "job-1",
    envelopeStatus: "signed",
    sourceSystem: "dropbox_sign",
    at: new Date().toISOString(),
    templateKey: "onboarding-v1",
    requiredSignersCompleted: true,
    requiredFieldsPresent: true,
    declinedOrCanceled: false,
    expiredOrFailed: false,
    ...partial,
  };
}

const COMPLETE_CHECKLIST = {
  signedOnboardingAgreement: true as const,
  i9Complete: true as const,
  taxFormsComplete: true as const,
  directDepositStatus: "complete" as const,
  identificationDocument: true as const,
  clientSpecificForms: true as const,
  stateSpecificForms: "na" as const,
  workerClassification: true as const,
  policyAcknowledgments: true as const,
  trainingAcknowledgments: true as const,
};

describe("P186.5 post-sign + MEL export queue", () => {
  let pgliteDir: string;

  beforeEach(async () => {
    for (const k of [
      "P186_POST_SIGN_OBSERVER",
      "P186_ONBOARDING_CHECKLIST",
      "P186_ONBOARDING_REVIEW_ACTIONS",
      "P186_READY_FOR_MEL_REVIEW_ACTIONS",
      "P186_MEL_EXPORT_QUEUE",
      "P186_MEL_EXPORT_PREVIEW",
      "P186_POST_SIGN_RECONCILIATION",
      "P186_POST_SIGN_HEALTH_DASHBOARD",
    ]) {
      delete process.env[k];
    }
    pgliteDir = await mkdtemp(path.join(os.tmpdir(), "p1865-pg-"));
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
    await rm(pgliteDir, { recursive: true, force: true });
  });

  it("feature flags default off", () => {
    const f = readP1865Flags();
    assert.equal(f.postSignObserver, false);
    assert.equal(f.melExportQueue, false);
    assert.equal(f.reconciliation, false);
  });

  it("resolves unambiguous post-sign events and rejects ambiguous", () => {
    const ok = resolvePostSignEvent({
      candidateId: "c1",
      envelopeId: "e1",
      rolloutOrSendId: "s1",
      onboardingAssignmentId: "oa1",
      jobOrProjectId: "j1",
      envelopeStatus: "signed",
      sourceSystem: "dropbox",
    });
    assert.equal(ok.ok, true);

    const bad = resolvePostSignEvent({
      candidateId: "c1",
      envelopeId: "e1",
      rolloutOrSendId: "s1",
      onboardingAssignmentId: "oa1",
      jobOrProjectId: "j1",
      sourceSystem: "dropbox",
      ambiguousCandidateIds: ["c1", "c2"],
    });
    assert.equal(bad.ok, false);
  });

  it("validates signed envelope and rejects viewed", () => {
    const signed = verifySignedPaperwork({
      event: signedEvent(),
      expectedCandidateId: "cand-1",
      expectedTemplateKey: "onboarding-v1",
      productionRecordExists: true,
      onboardingAssignmentValid: true,
      allRequiredSignersCompleted: true,
      allRequiredFieldsPresent: true,
    });
    assert.equal(signed.ok, true);

    assert.equal(isViewedOrSentOnly("viewed"), true);
    const viewed = verifySignedPaperwork({
      event: signedEvent({ envelopeStatus: "viewed" }),
      expectedCandidateId: "cand-1",
      productionRecordExists: true,
      allRequiredSignersCompleted: true,
      allRequiredFieldsPresent: true,
    });
    assert.equal(viewed.ok, false);
    assert.ok(viewed.codes.includes("not_signed"));
  });

  it("blocks missing signer, canceled, declined, template mismatch, identity mismatch", () => {
    const missingSigner = verifySignedPaperwork({
      event: signedEvent({ requiredSignersCompleted: false }),
      expectedCandidateId: "cand-1",
      productionRecordExists: true,
      allRequiredSignersCompleted: false,
      allRequiredFieldsPresent: true,
    });
    assert.ok(missingSigner.codes.includes("missing_signer"));

    const canceled = verifySignedPaperwork({
      event: signedEvent({ declinedOrCanceled: true }),
      expectedCandidateId: "cand-1",
      productionRecordExists: true,
      allRequiredSignersCompleted: true,
      allRequiredFieldsPresent: true,
    });
    assert.ok(canceled.codes.includes("declined_or_canceled"));

    const declined = verifySignedPaperwork({
      event: signedEvent({ declinedOrCanceled: true, envelopeStatus: "declined" }),
      expectedCandidateId: "cand-1",
      productionRecordExists: true,
      allRequiredSignersCompleted: true,
      allRequiredFieldsPresent: true,
    });
    assert.ok(declined.codes.includes("declined_or_canceled"));

    const template = verifySignedPaperwork({
      event: signedEvent({ templateKey: "other" }),
      expectedCandidateId: "cand-1",
      expectedTemplateKey: "onboarding-v1",
      productionRecordExists: true,
      allRequiredSignersCompleted: true,
      allRequiredFieldsPresent: true,
    });
    assert.ok(template.codes.includes("template_mismatch"));

    const identity = verifySignedPaperwork({
      event: signedEvent({ candidateId: "other" }),
      expectedCandidateId: "cand-1",
      productionRecordExists: true,
      allRequiredSignersCompleted: true,
      allRequiredFieldsPresent: true,
    });
    assert.ok(identity.codes.includes("identity_mismatch"));
  });

  it("classifies complete, missing-document, and conflicting states", () => {
    const complete = classifyOnboardingReadiness({
      event: signedEvent(),
      productionState: "Signed",
      shadowState: "SIGNED",
      productionRecordExists: true,
      checklist: COMPLETE_CHECKLIST,
    });
    assert.equal(complete.state, "paperwork_signed_complete");

    const missing = classifyOnboardingReadiness({
      event: signedEvent(),
      productionState: "Signed",
      shadowState: "SIGNED",
      productionRecordExists: true,
      checklist: {
        ...COMPLETE_CHECKLIST,
        taxFormsComplete: false,
      },
    });
    assert.equal(missing.state, "paperwork_signed_missing_documents");

    const conflict = classifyOnboardingReadiness({
      event: signedEvent(),
      productionState: "Paperwork Sent",
      shadowState: "APPLIED",
      productionRecordExists: true,
      checklist: COMPLETE_CHECKLIST,
    });
    assert.equal(conflict.state, "paperwork_signed_conflicting_state");
  });

  it("proposes Ready for MEL shadow transition without mutating production", () => {
    const proposal = proposeShadowTransition(
      "ONBOARDING_COMPLETE",
      "READY_FOR_MEL",
      "checklist complete",
    );
    assert.ok("to" in proposal);
    if ("to" in proposal) {
      assert.equal(proposal.to, "READY_FOR_MEL");
      assert.equal(proposal.legal, true);
    }
    assert.ok(listAllowedShadowTransitions().length >= 5);
  });

  it("production write through authorized adapter only; no direct lifecycle mutation", async () => {
    let wrote = false;
    const result = await executePostSignReviewAction({
      action: "approve_onboarding_completion",
      candidateId: "cand-1",
      actor: "op1",
      role: "operator",
      forceFlags: { onboardingReviewActions: true },
      deps: {
        upsert: async (input) => {
          wrote = true;
          assert.equal(input.workflowStatus, "Awaiting DD Verification");
          return {
            candidateId: "cand-1",
            workflowStatus: "Awaiting DD Verification",
            paperworkStatus: "signed",
          } as never;
        },
        observe: async () => undefined,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(wrote, true);
    assert.equal(result.shadowObservationTriggered, true);
  });

  it("durable MEL queue creation + duplicate prevention + existing MEL exclusion", async () => {
    const client = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    await applyP1865Migrations(client);

    const first = await enqueueMelExportItem({
      candidateId: "cand-mel",
      jobOrProjectId: "job-1",
      onboardingAssignmentId: "oa-1",
      approvalEventId: "apr-1",
      client,
      forceFlags: { melExportQueue: true },
    });
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.created, true);

    const dupKey = await enqueueMelExportItem({
      candidateId: "cand-mel",
      jobOrProjectId: "job-1",
      onboardingAssignmentId: "oa-1",
      approvalEventId: "apr-1",
      client,
      forceFlags: { melExportQueue: true },
    });
    assert.equal(dupKey.ok, true);
    if (dupKey.ok) assert.equal(dupKey.created, false);

    const dupCandidate = await enqueueMelExportItem({
      candidateId: "cand-mel",
      jobOrProjectId: "job-2",
      onboardingAssignmentId: "oa-2",
      approvalEventId: "apr-2",
      client,
      forceFlags: { melExportQueue: true },
    });
    assert.equal(dupCandidate.ok, false);
    if (!dupCandidate.ok) assert.equal(dupCandidate.code, "duplicate_queue");

    const excluded = await enqueueMelExportItem({
      candidateId: "cand-exported",
      existingMelRecord: true,
      forceFlags: { melExportQueue: true },
      client,
    });
    assert.equal(excluded.ok, false);
    if (!excluded.ok) assert.equal(excluded.code, "already_exported");
  });

  it("concurrent queue creation is idempotent", async () => {
    const client = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    await applyP1865Migrations(client);
    const args = {
      candidateId: "cand-race",
      jobOrProjectId: "job-r",
      onboardingAssignmentId: "oa-r",
      approvalEventId: "apr-r",
      client,
      forceFlags: { melExportQueue: true as const },
    };
    const [a, b] = await Promise.all([
      enqueueMelExportItem(args),
      enqueueMelExportItem(args),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && b.ok) {
      assert.equal(a.item.idempotencyKey, b.item.idempotencyKey);
      assert.equal(a.created || b.created, true);
      assert.equal(a.created && b.created, false);
    }
  });

  it("export preview redacts sensitive references", () => {
    const preview = buildMelExportPreview({
      candidateId: "cand-1",
      jobOrProjectId: "job-1",
      requiredFieldReadinessPct: 100,
      missingFields: [],
      sourceSystemReferences: ["workflow:cand-1", "secret-token-xyz", "ssn:123"],
      forceFlags: { melExportPreview: true },
    });
    assert.equal(preview.ok, true);
    assert.ok(preview.preview);
    assert.ok(!preview.preview!.candidateIdHash.includes("cand-1"));
    assert.ok(!preview.preview!.sourceSystemReferences.some((r) => /secret|ssn/i.test(r)));
  });

  it("reconciliation findings are read-only", () => {
    const report = reconcilePostSignAndMel({
      forceFlags: { reconciliation: true },
      cohort: [
        {
          candidateId: "c1",
          dropboxSignStatus: "signed",
          productionWorkflowState: "Paperwork Sent",
          shadowState: "PAPERWORK_SENT",
        },
        {
          candidateId: "c2",
          productionWorkflowState: "Ready for MEL",
          checklistComplete: false,
          shadowState: "READY_FOR_MEL",
        },
      ],
    });
    assert.equal(report.ok, true);
    assert.equal(report.productionRepairs, 0);
    assert.ok(report.findings.some((f) => f.kind === "signed_but_production_paperwork_sent"));
    assert.ok(report.findings.some((f) => f.kind === "ready_for_mel_without_checklist"));
  });

  it("enforces role authorization", () => {
    assert.equal(canPerformP1865Action("read_only_viewer", "approve_ready_for_mel"), false);
    assert.equal(canPerformP1865Action("recruiter", "request_missing_documents"), true);
    assert.equal(canPerformP1865Action("recruiter", "approve_onboarding_completion"), false);
    assert.equal(canPerformP1865Action("operator", "approve_ready_for_mel"), true);
    assert.equal(canPerformP1865Action("dm", "place_onboarding_hold"), true);
  });

  it("immutable audit logging persists", async () => {
    const client = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    const id = await appendP1865Audit({
      actor: "op1",
      action: "add_note",
      candidateId: "c1",
      detail: "note",
      client,
    });
    const rows = await client.query(`SELECT * FROM p186_5_audit WHERE id = $1`, [id]);
    assert.equal(rows.rowCount, 1);
  });

  it("restart persistence for MEL queue", async () => {
    const client = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    await enqueueMelExportItem({
      candidateId: "persist-1",
      jobOrProjectId: "j",
      onboardingAssignmentId: "oa",
      approvalEventId: "a1",
      client,
      forceFlags: { melExportQueue: true },
    });
    await resetSqlClientCacheForTests();
    const client2 = await createSqlClient({
      forceNew: true,
      forcePglite: true,
      pgliteDataDir: pgliteDir,
    });
    const again = await enqueueMelExportItem({
      candidateId: "persist-1",
      jobOrProjectId: "j",
      onboardingAssignmentId: "oa",
      approvalEventId: "a1",
      client: client2,
      forceFlags: { melExportQueue: true },
    });
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.created, false);
  });

  it("checklist stores metadata only", () => {
    const c = buildOnboardingChecklist(COMPLETE_CHECKLIST);
    assert.equal(c.completionPct, 100);
    assert.ok(c.items.every((i) => !("rawDocument" in i)));
    assert.ok(c.items.every((i) => i.redactedReference == null || i.redactedReference.startsWith("ref:")));
  });

  it("does not import MEL write or paperwork send APIs", async () => {
    const dir = path.join(process.cwd(), "src/lib/p186-5-post-sign-mel-queue");
    const files = [
      "index.ts",
      "melQueue.ts",
      "reviewActions.ts",
      "dashboard.ts",
      "reconciliation.ts",
      "classifier.ts",
    ];
    for (const f of files) {
      const text = await readFile(path.join(dir, f), "utf8");
      assert.equal(
        /from\s+["']@\/lib\/p184|from\s+["']@\/lib\/p185-production|from\s+["']@\/lib\/p185-3|import\s+.*executeOnboardingSend|import\s+.*sendPaperwork|exportToMelApi|callMelApi/i.test(
          text,
        ),
        false,
        `unexpected import in ${f}`,
      );
      assert.equal(/P185_PRODUCTION_AUTOMATION_ENABLED\s*=\s*["']1["']/.test(text), false);
    }
  });

  it("Ready for MEL proposal classification", () => {
    const ready = classifyOnboardingReadiness({
      event: signedEvent(),
      productionState: "Ready for MEL",
      shadowState: "READY_FOR_MEL",
      productionRecordExists: true,
      checklist: COMPLETE_CHECKLIST,
    });
    assert.equal(ready.state, "ready_for_mel_review");
  });
});
