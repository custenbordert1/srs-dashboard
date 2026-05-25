import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  recordCandidatePaperworkSent,
} from "@/lib/candidate-workflow-store";
import { handleDropboxSignWebhookEvent } from "@/lib/dropbox-sign-webhook-handler";
import type { DropboxSignWebhookPayload } from "@/lib/dropbox-sign-webhook";

function signedPayload(signatureRequestId: string): DropboxSignWebhookPayload {
  const event_time = "1716650000";
  const event_type = "signature_request_signed";
  const event_hash = createHmac("sha256", "test-key")
    .update(`${event_time}${event_type}`)
    .digest("hex");
  return {
    event: { event_time, event_type, event_hash },
    signature_request: { signature_request_id: signatureRequestId },
  };
}

describe("dropbox-sign-webhook-handler", () => {
  it("updates workflow to Signed on signature_request_signed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-webhook-signed-"));
    const prevDataDir = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = dir;
    try {
      await recordCandidatePaperworkSent({
        candidateId: "c-webhook-1",
        signatureRequestId: "sig-webhook-99",
        templateKey: "onboarding_packet",
      });

      const result = await handleDropboxSignWebhookEvent(signedPayload("sig-webhook-99"));
      assert.equal(result.handled, true);
      assert.equal(result.candidateId, "c-webhook-1");
      assert.equal(result.workflow?.workflowStatus, "Signed");
      assert.equal(result.workflow?.paperworkStatus, "signed");
      assert.ok(result.workflow?.paperworkSignedAt);
    } finally {
      if (prevDataDir === undefined) delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
      else process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = prevDataDir;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("records viewed metadata on signature_request_viewed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-webhook-viewed-"));
    const prevDataDir = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = dir;
    try {
      await recordCandidatePaperworkSent({
        candidateId: "c-webhook-2",
        signatureRequestId: "sig-webhook-view",
        templateKey: "onboarding_packet",
      });

      const payload: DropboxSignWebhookPayload = {
        event: {
          event_time: "1716650001",
          event_type: "signature_request_viewed",
          event_hash: "ignored-in-handler-test",
        },
        signature_request: { signature_request_id: "sig-webhook-view" },
      };
      const result = await handleDropboxSignWebhookEvent(payload);
      assert.equal(result.handled, true);
      assert.equal(result.workflow?.paperworkStatus, "viewed");
      assert.equal(result.workflow?.paperworkViewCount, 1);
      assert.ok(result.workflow?.paperworkViewedAt);
    } finally {
      if (prevDataDir === undefined) delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
      else process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = prevDataDir;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
