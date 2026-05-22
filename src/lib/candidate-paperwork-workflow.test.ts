import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import {
  applyCandidatePaperworkStatus,
  recordCandidatePaperworkSent,
} from "@/lib/candidate-workflow-store";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("candidate paperwork workflow", () => {
  it("maps Dropbox Sign complete response to signed", () => {
    assert.equal(
      mapSignatureRequestToPaperworkStatus({
        signatureRequestId: "req-1",
        isComplete: true,
        isDeclined: false,
        signatures: [],
        rawStatus: "complete",
      }),
      "signed",
    );
  });

  it("updates workflow to Paperwork Sent after send record", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-paperwork-"));
    const prev = process.cwd();
    process.chdir(dir);
    try {
      const workflow = await recordCandidatePaperworkSent({
        candidateId: "c-paper-1",
        signatureRequestId: "sig-req-99",
        templateKey: "onboarding_packet",
      });
      assert.equal(workflow.workflowStatus, "Paperwork Sent");
      assert.equal(workflow.signatureRequestId, "sig-req-99");
      assert.equal(workflow.paperworkTemplateKey, "onboarding_packet");
      assert.equal(workflow.paperworkStatus, "sent");
      assert.ok(workflow.paperworkSentAt);
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("updates workflow to Signed when paperwork status is signed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-paperwork-signed-"));
    const prev = process.cwd();
    process.chdir(dir);
    try {
      await recordCandidatePaperworkSent({
        candidateId: "c-paper-2",
        signatureRequestId: "sig-req-100",
        templateKey: "wage_consent",
      });
      const workflow = await applyCandidatePaperworkStatus({
        candidateId: "c-paper-2",
        signatureRequestId: "sig-req-100",
        paperworkStatus: "signed",
      });
      assert.equal(workflow.workflowStatus, "Signed");
      assert.equal(workflow.paperworkStatus, "signed");
      assert.ok(workflow.paperworkSignedAt);
    } finally {
      process.chdir(prev);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
