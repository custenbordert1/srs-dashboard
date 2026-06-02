import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  buildTerritoryAlertPipeline,
  countFillRiskAlerts,
  countNeedsAttentionAlerts,
} from "@/lib/dm-dashboard/territory-alert-pipeline";

const fetchedAt = "2026-05-28T12:00:00.000Z";

function job(overrides: Partial<BreezyJob> & { jobId: string }): BreezyJob {
  return {
    jobId: overrides.jobId,
    name: overrides.name ?? "Rep",
    city: overrides.city ?? "Columbus",
    state: overrides.state ?? "OH",
    status: "published",
    createdDate: overrides.createdDate ?? "2026-04-01T00:00:00.000Z",
    updatedDate: overrides.updatedDate ?? overrides.createdDate ?? "2026-04-01T00:00:00.000Z",
    candidateCount: overrides.candidateCount ?? 0,
    ...overrides,
  } as BreezyJob;
}

describe("territory-alert-pipeline", () => {
  it("orchestrates fill-risk and needs-attention without changing raw fill-risk count", () => {
    const jobs = [job({ jobId: "j1", createdDate: "2026-01-01T00:00:00.000Z" })];
    const candidates: BreezyCandidate[] = [];

    const pipeline = buildTerritoryAlertPipeline(jobs, candidates, fetchedAt, { healthScore: 40 });

    assert.ok(pipeline.fillRiskAlerts.length > 0);
    assert.equal(countFillRiskAlerts(pipeline.fillRiskAlerts), pipeline.fillRiskAlerts.length);
    assert.ok(pipeline.prioritizedAlerts.length >= 1);
    assert.equal(
      countNeedsAttentionAlerts(pipeline.alertSummary),
      pipeline.alertSummary.criticalCount +
        pipeline.alertSummary.highCount +
        pipeline.alertSummary.mediumCount,
    );
    assert.ok(countNeedsAttentionAlerts(pipeline.alertSummary) <= pipeline.prioritizedAlerts.length);
  });
});
