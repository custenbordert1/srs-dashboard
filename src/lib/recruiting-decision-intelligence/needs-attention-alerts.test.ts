import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import {
  buildCoverageHealthMetrics,
  buildNeedsAttentionAlerts,
  coveragePercentTone,
} from "@/lib/recruiting-decision-intelligence/needs-attention-alerts";

const referenceIso = "2026-05-28T12:00:00.000Z";

describe("needs-attention-alerts", () => {
  it("flags jobs with zero applicants after 7 days", () => {
    const alerts = buildNeedsAttentionAlerts({
      jobs: [
        {
          jobId: "j1",
          name: "Merchandiser",
          city: "Houston",
          state: "TX",
          createdDate: "2026-05-01T00:00:00.000Z",
          updatedDate: "2026-05-01T00:00:00.000Z",
        } as BreezyJob,
      ],
      candidates: [],
      coverageRecommendations: [],
      activeReps: [],
      referenceIso,
    });
    assert.ok(alerts.some((row) => row.kind === "zero-applicants"));
  });

  it("computes coverage health tone bands", () => {
    assert.equal(coveragePercentTone(85), "good");
    assert.equal(coveragePercentTone(60), "warn");
    assert.equal(coveragePercentTone(40), "critical");
  });

  it("builds coverage percent from open calls and active reps", () => {
    const metrics = buildCoverageHealthMetrics({
      jobs: [{ jobId: "j1" } as BreezyJob],
      activeReps: [{ active: true } as import("@/lib/rep-intelligence/rep-types").ActiveRep],
      coverageRecommendations: [
        {
          jobId: "j1",
          openOpportunityCount: 4,
        } as import("@/lib/recruiting-decision-intelligence/types").CoverageRecommendation,
      ],
    });
    assert.equal(metrics.coveragePercent, 25);
  });
});
