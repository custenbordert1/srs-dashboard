import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  __resetRecruitingIntelligenceCacheForTests,
  __setRecruitingIntelligenceCacheForTests,
  getCachedRecruitingIntelligenceSnapshot,
  getRecruitingIntelligenceCacheDiagnostics,
  RECRUITING_INTELLIGENCE_CACHE_TTL_MS,
} from "@/lib/recruiting-intelligence/recruiting-intelligence-cache";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

function mockSnapshot(builtAt: string): RecruitingIntelligenceSnapshot {
  return {
    fetchedAt: builtAt,
    builtAt,
    jobsResult: { ok: true, jobs: [], fetchedAt: builtAt },
    candidatesResult: {
      ok: true,
      candidates: [],
      fetchedAt: builtAt,
      scanMode: "fast",
      positionsScanned: 0,
      totalPositionsAvailable: 0,
    },
    workflows: {},
    melResult: { ok: true, rows: [], fetchedAt: builtAt },
    opportunities: [],
    activeReps: [],
    melOk: true,
    globalCoverage: null,
    metrics: {
      jobCount: 0,
      candidateCount: 0,
      workflowCount: 0,
      opportunityCount: 0,
      activeRepCount: 0,
      openCalls: 0,
      avgCoveragePercent: 0,
      criticalOpportunities: 0,
      partialCandidateSync: false,
      melAvailable: true,
    },
  };
}

describe("recruiting-intelligence-cache", () => {
  beforeEach(() => {
    __resetRecruitingIntelligenceCacheForTests();
  });

  it("serves fresh cached snapshot without rebuilding", async () => {
    const builtAt = new Date().toISOString();
    __setRecruitingIntelligenceCacheForTests(mockSnapshot(builtAt));

    const first = await getCachedRecruitingIntelligenceSnapshot();
    const second = await getCachedRecruitingIntelligenceSnapshot();

    assert.equal(first.snapshot.builtAt, builtAt);
    assert.equal(second.snapshot.builtAt, builtAt);
    assert.equal(second.meta.cacheStatus, "fresh");

    const diagnostics = getRecruitingIntelligenceCacheDiagnostics();
    assert.equal(diagnostics.hitCount, 2);
    assert.equal(diagnostics.missCount, 0);
  });

  it("serves stale snapshot while marking stale-serving status", async () => {
    const builtAt = new Date(Date.now() - RECRUITING_INTELLIGENCE_CACHE_TTL_MS - 1000).toISOString();
    __setRecruitingIntelligenceCacheForTests(mockSnapshot(builtAt), { expired: true });

    const response = await getCachedRecruitingIntelligenceSnapshot();
    assert.equal(response.snapshot.builtAt, builtAt);
    assert.equal(response.meta.isStale, true);
    assert.ok(
      response.meta.cacheStatus === "stale-serving" || response.meta.cacheStatus === "refreshing",
    );

    const diagnostics = getRecruitingIntelligenceCacheDiagnostics();
    assert.equal(diagnostics.staleServeCount, 1);
    assert.equal(diagnostics.isStale, true);
  });
});
