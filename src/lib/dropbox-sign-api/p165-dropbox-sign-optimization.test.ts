import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  beginDropboxSignExecutionScope,
  endDropboxSignExecutionScope,
  getDropboxSignApiMetricsSnapshot,
  rememberExecutionScopeSignature,
  resetDropboxSignApiMetrics,
  resetDropboxThrottleState,
} from "@/lib/dropbox-sign-api";
import { planMonitorPackets } from "@/lib/paperwork-monitor/plan-monitor-packets";
import type { ActivePaperworkPacket } from "@/lib/paperwork-monitor/select-active-packets";

function mockPacket(id: string, sentAt: string | null = null): ActivePaperworkPacket {
  return {
    candidateId: id,
    candidateName: id,
    signatureRequestId: `sig-${id}`,
    workflow: {
      candidateId: id,
      paperworkStatus: "sent",
      workflowStatus: "Paperwork Sent",
      paperworkSentAt: sentAt,
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      signatureRequestId: `sig-${id}`,
    } as ActivePaperworkPacket["workflow"],
    onboarding: null,
  };
}

describe("P165 plan-monitor-packets", () => {
  const allActive = Array.from({ length: 91 }, (_, i) =>
    mockPacket(`c${i}`, `2026-07-08T15:32:${String(26 + (i % 10)).padStart(2, "0")}.000Z`),
  );

  it("postCycle polls only priority packets and defers historical", () => {
    const priority = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"];
    const plan = planMonitorPackets({
      allActive,
      scope: "postCycle",
      priorityCandidateIds: priority,
    });
    assert.equal(plan.packetsToPoll.length, 10);
    assert.equal(plan.projectedGetRequests, 10);
    assert.equal(plan.deferredCandidateIds.length, 81);
  });

  it("scheduled scope respects budget and defers overflow", () => {
    const plan = planMonitorPackets({
      allActive,
      scope: "scheduled",
      budgetLimit: 25,
    });
    assert.equal(plan.packetsToPoll.length, 25);
    assert.equal(plan.deferredCandidateIds.length, 66);
    assert.equal(plan.budgetExceeded, true);
  });
});

describe("P165 dropbox execution scope dedupe", () => {
  beforeEach(() => {
    resetDropboxSignApiMetrics();
    resetDropboxThrottleState();
  });

  it("remembers signatures within execution scope", () => {
    beginDropboxSignExecutionScope();
    rememberExecutionScopeSignature({
      signatureRequestId: "sig-1",
      isComplete: false,
      isDeclined: false,
      rawStatus: "pending",
      signatures: [],
    });
    const metrics = getDropboxSignApiMetricsSnapshot();
    endDropboxSignExecutionScope();
    assert.equal(metrics.totalRequests, 0);
  });
});
