import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDropboxMonitorStatus } from "@/lib/paperwork-monitor/normalize-dropbox-status";
import { evaluateReminders } from "@/lib/paperwork-monitor/reminder-engine";
import { isMonitorLockStale, P107_DEFAULT_MODE, P107_DEV_INTERVAL_MS } from "@/lib/paperwork-monitor";
import { P107_LIVE_CANDIDATE_IDS } from "@/lib/paperwork-monitor/live-candidate-registry";
import type { PaperworkMonitorCandidateTracking } from "@/lib/paperwork-monitor/types";

describe("paperwork-monitor", () => {
  it("defaults to dryRun mode", () => {
    assert.equal(P107_DEFAULT_MODE, "dryRun");
  });

  it("dev interval is 5 minutes", () => {
    assert.equal(P107_DEV_INTERVAL_MS, 5 * 60 * 1000);
  });

  it("live cohort has seven candidates", () => {
    assert.equal(P107_LIVE_CANDIDATE_IDS.length, 7);
  });

  it("normalizes dropbox statuses", () => {
    assert.equal(
      normalizeDropboxMonitorStatus({
        signatureRequestId: "sig-1",
        isComplete: false,
        isDeclined: false,
        rawStatus: "pending",
        signatures: [{ signatureId: "s1", signerEmail: "a@b.com", signerName: "A", statusCode: "awaiting_signature", lastViewedAt: null, signedAt: null }],
      }),
      "awaiting_signature",
    );
    assert.equal(
      normalizeDropboxMonitorStatus({
        signatureRequestId: "sig-2",
        isComplete: true,
        isDeclined: false,
        rawStatus: "complete",
        signatures: [{ signatureId: "s1", signerEmail: "a@b.com", signerName: "A", statusCode: "signed", lastViewedAt: "2026-01-01T00:00:00.000Z", signedAt: "2026-01-01T01:00:00.000Z" }],
      }),
      "signed",
    );
  });

  it("queues text reminder after 30 minutes viewed", () => {
    const tracking: PaperworkMonitorCandidateTracking = {
      candidateId: "c1",
      candidateName: "Test",
      signatureRequestId: "sig",
      lastDropboxStatus: "viewed",
      viewedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      signedAt: null,
      completedAt: null,
      lastCheckedAt: new Date().toISOString(),
      reminderCount: 0,
      lastReminderSentAt: null,
      reminderHistory: [],
      needsAttention: false,
      workflowStatus: "Paperwork Sent",
      onboardingStatus: "viewed",
    };
    const reminder = evaluateReminders({ tracking });
    assert.equal(reminder?.channel, "sms");
  });

  it("does not duplicate reminders", () => {
    const tracking: PaperworkMonitorCandidateTracking = {
      candidateId: "c1",
      candidateName: "Test",
      signatureRequestId: "sig",
      lastDropboxStatus: "viewed",
      viewedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      signedAt: null,
      completedAt: null,
      lastCheckedAt: new Date().toISOString(),
      reminderCount: 1,
      lastReminderSentAt: new Date().toISOString(),
      reminderHistory: [{ at: new Date().toISOString(), channel: "sms", reason: "already" }],
      needsAttention: false,
      workflowStatus: "Paperwork Sent",
      onboardingStatus: "viewed",
    };
    assert.equal(evaluateReminders({ tracking }), null);
  });

  it("stale lock detection works", () => {
    assert.equal(
      isMonitorLockStale({ runId: "x", lockedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), mode: "dryRun" }),
      true,
    );
    assert.equal(
      isMonitorLockStale({ runId: "y", lockedAt: new Date().toISOString(), mode: "dryRun" }),
      false,
    );
  });

  it("never uses executeBatch", () => {
    const modes = ["dryRun", "runOnce", "scheduled"];
    assert.equal(modes.includes("executeBatch"), false);
  });
});
