import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  recordCandidatePaperworkSent,
  applyCandidatePaperworkSigned,
} from "@/lib/candidate-workflow-store";
import {
  requestDirectDepositAfterPaperworkSigned,
  resendDirectDepositVerificationEmail,
  markDirectDepositReceived,
  markDirectDepositApproved,
} from "@/lib/direct-deposit-workflow";

describe("direct-deposit-workflow", () => {
  it("requests DD verification once after signed paperwork", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-dd-"));
    const prev = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    const prevMode = process.env.DIRECT_DEPOSIT_EMAIL_MODE;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = dir;
    process.env.DIRECT_DEPOSIT_EMAIL_MODE = "log";
    try {
      await recordCandidatePaperworkSent({
        candidateId: "c-dd-1",
        signatureRequestId: "sig-dd-1",
        templateKey: "onboarding_packet",
        onboardingContactEmail: "candidate@example.com",
      });
      const signed = await applyCandidatePaperworkSigned({
        candidateId: "c-dd-1",
        signatureRequestId: "sig-dd-1",
      });
      const result = await requestDirectDepositAfterPaperworkSigned({
        workflow: signed,
        recipientEmail: "candidate@example.com",
      });
      assert.equal(result.emailSent, true);
      assert.equal(result.workflow.workflowStatus, "Awaiting DD Verification");
      assert.equal(result.workflow.directDepositStatus, "requested");
      assert.ok(result.workflow.directDepositRequestedAt);

      const dup = await requestDirectDepositAfterPaperworkSigned({ workflow: result.workflow });
      assert.equal(dup.skipped, "already_requested");
      assert.equal(dup.emailSent, false);
    } finally {
      if (prev === undefined) delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
      else process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = prev;
      if (prevMode === undefined) delete process.env.DIRECT_DEPOSIT_EMAIL_MODE;
      else process.env.DIRECT_DEPOSIT_EMAIL_MODE = prevMode;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("logs outbound email to outbox", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-dd-outbox-"));
    const prev = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = dir;
    process.env.DIRECT_DEPOSIT_EMAIL_MODE = "log";
    try {
      await recordCandidatePaperworkSent({
        candidateId: "c-dd-2",
        signatureRequestId: "sig-dd-2",
        templateKey: "onboarding_packet",
        onboardingContactEmail: "outbox@example.com",
      });
      const signed = await applyCandidatePaperworkSigned({
        candidateId: "c-dd-2",
        signatureRequestId: "sig-dd-2",
      });
      await requestDirectDepositAfterPaperworkSigned({
        workflow: signed,
        recipientEmail: "outbox@example.com",
      });
      const outbox = await readFile(path.join(dir, "transactional-email-outbox.jsonl"), "utf8");
      assert.match(outbox, /outbox@example.com/);
      assert.match(outbox, /Direct Deposit Verification Needed/);
    } finally {
      if (prev === undefined) delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
      else process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires received before approved", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-dd-approve-"));
    const prev = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = dir;
    process.env.DIRECT_DEPOSIT_EMAIL_MODE = "log";
    try {
      await recordCandidatePaperworkSent({
        candidateId: "c-dd-3",
        signatureRequestId: "sig-dd-3",
        templateKey: "onboarding_packet",
        onboardingContactEmail: "a@example.com",
      });
      const signed = await applyCandidatePaperworkSigned({
        candidateId: "c-dd-3",
        signatureRequestId: "sig-dd-3",
      });
      await requestDirectDepositAfterPaperworkSigned({
        workflow: signed,
        recipientEmail: "a@example.com",
      });
      const received = await markDirectDepositReceived({ candidateId: "c-dd-3" });
      assert.equal(received.directDepositStatus, "received");
      const approved = await markDirectDepositApproved({ candidateId: "c-dd-3" });
      assert.equal(approved.directDepositStatus, "approved");
      assert.match(
        approved.history.map((e) => e.message).join(" "),
        /approved/i,
      );
    } finally {
      if (prev === undefined) delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
      else process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resend updates last reminder timestamp", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "srs-dd-resend-"));
    const prev = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
    process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = dir;
    process.env.DIRECT_DEPOSIT_EMAIL_MODE = "log";
    try {
      await recordCandidatePaperworkSent({
        candidateId: "c-dd-4",
        signatureRequestId: "sig-dd-4",
        templateKey: "onboarding_packet",
        onboardingContactEmail: "resend@example.com",
      });
      const signed = await applyCandidatePaperworkSigned({
        candidateId: "c-dd-4",
        signatureRequestId: "sig-dd-4",
      });
      const first = await requestDirectDepositAfterPaperworkSigned({
        workflow: signed,
        recipientEmail: "resend@example.com",
      });
      const firstReminder = first.workflow.directDepositLastReminderAt;
      await new Promise((resolve) => setTimeout(resolve, 5));
      const resent = await resendDirectDepositVerificationEmail({
        candidateId: "c-dd-4",
        recipientEmail: "resend@example.com",
      });
      assert.ok(resent.workflow.directDepositLastReminderAt);
      assert.notEqual(resent.workflow.directDepositLastReminderAt, firstReminder);
    } finally {
      if (prev === undefined) delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
      else process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
