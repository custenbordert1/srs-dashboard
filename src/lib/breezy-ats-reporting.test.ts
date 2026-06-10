import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applicantsPerOpeningFromAts,
  buildAtsHeadlineKpis,
} from "@/lib/breezy-ats-reporting";
import type { BreezyAtsMetrics } from "@/lib/breezy-ats-metrics";

function metrics(overrides: Partial<BreezyAtsMetrics> = {}): BreezyAtsMetrics {
  return {
    candidatesLoaded: 100,
    publishedJobs: 20,
    applicantsToday: 5,
    applicants7d: 42,
    positionsScanned: 18,
    totalPositionsAvailable: 20,
    positionsNotScanned: 2,
    scanMode: "fast",
    syncTier: "partial",
    partialSync: true,
    fromCache: false,
    stale: false,
    truncated: false,
    hydrationComplete: undefined,
    lastSuccessfulSync: new Date().toISOString(),
    lastSuccessfulSyncLabel: "May 28, 2026",
    partialReasons: ["2 published positions not scanned yet"],
    ancillaryPartialErrors: [],
    ...overrides,
  };
}

describe("breezy-ats-reporting", () => {
  it("computes applicants per opening from loaded candidates and published jobs", () => {
    assert.equal(applicantsPerOpeningFromAts(metrics()), 5);
  });

  it("builds headline KPIs from ATS metrics not job-level sums", () => {
    const kpis = buildAtsHeadlineKpis(metrics());
    assert.equal(kpis.find((k) => k.id === "ats-candidates-loaded")?.value, "100");
    assert.equal(kpis.find((k) => k.id === "ats-active-jobs")?.value, "20");
    assert.equal(kpis.find((k) => k.id === "ats-applicants-7d")?.value, "42");
  });
});
