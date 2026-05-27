import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  ROUTING_PACK_ROW_LIMIT,
  buildRoutingIntelligenceSummary,
  filterOpportunitiesByRoutingScope,
  hasRoutingScopeFilter,
} from "@/lib/routing-intelligence/routing-intelligence-scope";

function opp(overrides: Partial<MelOpportunity> = {}): MelOpportunity {
  return {
    opportunityId: "o1",
    projectName: "Reset A",
    client: "Walmart",
    storeAddress: "123 Main",
    storeName: "Store",
    city: "Dallas",
    state: "TX",
    projectType: "Reset",
    priority: "high",
    openStatus: true,
    territoryOwner: "DM Alpha",
    storeCall: "Open",
    projectNo: "P1",
    isStaffed: false,
    ...overrides,
  };
}

describe("routing intelligence scope", () => {
  it("detects whether scope filters are set", () => {
    assert.equal(hasRoutingScopeFilter({}), false);
    assert.equal(hasRoutingScopeFilter({ status: "all" }), false);
    assert.equal(hasRoutingScopeFilter({ state: "TX" }), true);
    assert.equal(hasRoutingScopeFilter({ project: "Reset" }), true);
  });

  it("filters opportunities by dm/state/project/status", () => {
    const rows = [
      opp({ opportunityId: "o1", territoryOwner: "DM Alpha", state: "TX", projectName: "Reset A", isStaffed: false }),
      opp({ opportunityId: "o2", territoryOwner: "DM Beta", state: "OK", projectName: "Fixture B", isStaffed: true }),
    ];
    assert.equal(filterOpportunitiesByRoutingScope(rows, { dm: "DM Alpha" }).length, 1);
    assert.equal(filterOpportunitiesByRoutingScope(rows, { state: "ok" }).length, 1);
    assert.equal(filterOpportunitiesByRoutingScope(rows, { project: "fixture" }).length, 1);
    assert.equal(filterOpportunitiesByRoutingScope(rows, { status: "open" }).length, 1);
    assert.equal(filterOpportunitiesByRoutingScope(rows, { status: "staffed" }).length, 1);
  });

  it("marks over-limit scope in summary", () => {
    const rows = Array.from({ length: ROUTING_PACK_ROW_LIMIT + 1 }, (_, i) =>
      opp({ opportunityId: `o${i}`, projectNo: `P${i}` }),
    );
    const summary = buildRoutingIntelligenceSummary({
      fetchedAt: "2026-05-20T12:00:00.000Z",
      territoryLabel: "TX",
      melRowCount: rows.length,
      territoryOpportunities: rows,
      scope: { state: "TX" },
    });
    assert.equal(summary.overPackLimit, true);
    assert.equal(summary.scopeApplied, true);
  });
});
