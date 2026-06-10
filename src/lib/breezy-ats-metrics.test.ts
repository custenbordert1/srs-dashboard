import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBreezyAtsMetrics,
  countBreezyApplicantsToday,
  formatAutomationAtsStatusMessage,
} from "@/lib/breezy-ats-metrics";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";

function snapshot(partial: Partial<BreezyCandidatesSuccess>): BreezyCandidatesSuccess {
  return {
    ok: true,
    candidates: [{ candidateId: "1", appliedDate: new Date().toISOString() } as never],
    fetchedAt: new Date().toISOString(),
    positionsScanned: 10,
    totalPositionsAvailable: 20,
    scanMode: "fast",
    ...partial,
  };
}

describe("breezy-ats-metrics", () => {
  it("marks partial when positions remain unscanned", () => {
    const metrics = buildBreezyAtsMetrics(snapshot({ truncated: true }));
    assert.equal(metrics.partialSync, true);
    assert.equal(metrics.syncTier, "partial");
    assert.equal(metrics.positionsNotScanned, 10);
    assert.ok(metrics.partialReasons.length > 0);
  });

  it("uses countCandidatesLast7Days path for applicants7d", () => {
    const metrics = buildBreezyAtsMetrics(snapshot({ candidatesLast7Days: 42 }));
    assert.equal(metrics.applicants7d, 42);
  });

  it("separates ancillary partial errors in automation message", () => {
    const metrics = buildBreezyAtsMetrics(snapshot({ truncated: true }), null, {
      ancillaryPartialErrors: ["MEL store routing data unavailable"],
    });
    const message = formatAutomationAtsStatusMessage(metrics);
    assert.ok(message?.includes("Partial sync"));
    assert.ok(message?.includes("MEL store"));
  });

  it("returns null automation message when fully synced", () => {
    const metrics = buildBreezyAtsMetrics(
      snapshot({ positionsScanned: 20, totalPositionsAvailable: 20, truncated: false }),
    );
    assert.equal(formatAutomationAtsStatusMessage(metrics), null);
  });

  it("counts applicants today from rolling 24h window", () => {
    const now = new Date();
    const count = countBreezyApplicantsToday(
      [{ appliedDate: now.toISOString() } as never],
      now.toISOString(),
    );
    assert.equal(count, 1);
  });
});
