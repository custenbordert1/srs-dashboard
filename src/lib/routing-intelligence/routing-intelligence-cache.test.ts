import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoutingCacheKey,
  clearRoutingIntelligenceCaches,
  getCachedGeoClusters,
  setCachedGeoClusters,
} from "@/lib/routing-intelligence/routing-intelligence-cache";

describe("routing intelligence cache", () => {
  it("builds stable cache keys from territory inputs", () => {
    const key = buildRoutingCacheKey({
      melFetchedAt: "2026-05-20T12:00:00.000Z",
      territoryScope: "TX,OK",
      activeRepCount: 12,
      openJobCount: 40,
      opportunityCount: 500,
    });
    assert.match(key, /mel:500/);
    assert.match(key, /reps:12/);
  });

  it("stores and retrieves geo cluster cache entries", () => {
    clearRoutingIntelligenceCaches();
    const key = "test-geo";
    assert.equal(getCachedGeoClusters(key), null);
    setCachedGeoClusters(key, [
      {
        clusterId: "c1",
        label: "Dallas, TX",
        city: "Dallas",
        state: "TX",
        storeCount: 2,
        openStoreCalls: 2,
        clusterRadiusMiles: 10,
        stores: [],
      },
    ]);
    assert.equal(getCachedGeoClusters(key)?.length, 1);
    clearRoutingIntelligenceCaches();
  });
});
