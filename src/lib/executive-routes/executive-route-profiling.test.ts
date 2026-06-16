import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ExecutiveRouteTimer,
  shouldDeferExecutiveComputation,
} from "@/lib/executive-routes/executive-route-profiling";

describe("executive route profiling", () => {
  it("marks defer when elapsed exceeds deadline", () => {
    const timer = new ExecutiveRouteTimer("/api/test");
    assert.equal(shouldDeferExecutiveComputation(timer, 0), true);
    const report = timer.toReport(true);
    assert.equal(report.deferred, true);
  });

  it("does not defer under deadline", () => {
    const timer = new ExecutiveRouteTimer("/api/test");
    timer.mark("bundle_loaded", { candidateCount: 3, jobCount: 2 });
    assert.equal(shouldDeferExecutiveComputation(timer), false);
  });
});
