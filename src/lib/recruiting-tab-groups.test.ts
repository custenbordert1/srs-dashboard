import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NAV_GROUPS,
  allTabsInGroup,
  resolveNavGroupForTab,
} from "@/lib/recruiting-tab-groups";

describe("recruiting-tab-groups", () => {
  it("places Job Management in Operations primary nav before Territories", () => {
    const operations = NAV_GROUPS.find((group) => group.id === "operations");
    assert.ok(operations);
    assert.deepEqual(operations.primaryTabs, [
      "candidates",
      "recruiter-productivity",
      "job-management",
      "territory-intelligence",
    ]);
    assert.deepEqual(operations.secondaryTabs, ["live-sheet", "automation"]);
    assert.ok(!operations.secondaryTabs.includes("job-management"));
  });

  it("resolves job-management to operations for deep links", () => {
    assert.equal(resolveNavGroupForTab("job-management"), "operations");
    assert.ok(allTabsInGroup("operations").includes("job-management"));
  });
});
