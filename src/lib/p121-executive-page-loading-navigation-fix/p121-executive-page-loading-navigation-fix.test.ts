import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildP121Report, normalizeDashboardTabParam, P121_EXECUTIVE_TAB_IDS } from "@/lib/p121-executive-page-loading-navigation-fix";
import { getNavTabsForGroup } from "@/lib/recruiting-tab-groups";

describe("p121-executive-page-loading-navigation-fix", () => {
  it("audits all executive sub-tabs", () => {
    const report = buildP121Report();
    assert.equal(report.tabsAudited.length, P121_EXECUTIVE_TAB_IDS.length);
    for (const tabId of P121_EXECUTIVE_TAB_IDS) {
      assert.ok(report.tabsAudited.some((entry) => entry.tabId === tabId));
    }
  });

  it("normalizes legacy executive tab aliases", () => {
    assert.equal(normalizeDashboardTabParam("executive-forecast"), "executive-forecasting");
    assert.equal(normalizeDashboardTabParam("autopilot-ops"), "recruiting-autopilot-ops");
    assert.equal(normalizeDashboardTabParam("execution-center"), "recruiting-execution");
    assert.equal(normalizeDashboardTabParam("hiring-placement"), "placement-command-center");
    assert.equal(normalizeDashboardTabParam("executive-home"), "executive-home");
  });

  it("returns null for unknown tab params", () => {
    assert.equal(normalizeDashboardTabParam("not-a-tab"), null);
    assert.equal(normalizeDashboardTabParam(""), null);
  });

  it("registers workforce intelligence as inline dashboard tab (no external href)", () => {
    const tabs = getNavTabsForGroup("executive", "executive");
    const workforce = tabs.find((tab) => tab.id === "workforce-intelligence");
    assert.ok(workforce);
    assert.equal(workforce.href, undefined);
  });

  it("records degraded states and P120 safety preservation", () => {
    const report = buildP121Report();
    assert.ok(report.degradedStatesAdded.includes("pipeline-intelligence"));
    assert.ok(report.degradedStatesAdded.includes("workforce-intelligence"));
    assert.equal(report.safetyConfirmation.p120LayoutPreserved, true);
    assert.equal(report.safetyConfirmation.noPaperworkSends, true);
    assert.equal(report.safetyConfirmation.liveModeUnchanged, true);
  });
});
