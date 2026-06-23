import assert from "node:assert/strict";
import test from "node:test";
import {
  findNavGroupForTab,
  getDashboardNavGroups,
  getDefaultDashboardTab,
  getVisibleTabIdsForGroup,
} from "./recruiting-tab-groups";

test("maps tabs to the four navigation groups", () => {
  assert.equal(findNavGroupForTab("executive-home"), "executive");
  assert.equal(findNavGroupForTab("pipeline-intelligence"), "executive");
  assert.equal(findNavGroupForTab("recruiting-autopilot"), "executive");
  assert.equal(findNavGroupForTab("recruiting-autopilot-ops"), "executive");
  assert.equal(findNavGroupForTab("recruiting-execution"), "executive");
  assert.equal(findNavGroupForTab("placement-command-center"), "executive");
  assert.equal(findNavGroupForTab("command-center"), "operations");
  assert.equal(findNavGroupForTab("candidates"), "operations");
  assert.equal(findNavGroupForTab("dm-scorecards"), "territory-field");
  assert.equal(findNavGroupForTab("live-sheet"), "admin-data");
});

test("defaults executive users to executive home", () => {
  assert.equal(getDefaultDashboardTab("executive"), "executive-home");
  assert.equal(getDefaultDashboardTab("recruiter"), "command-center");
});

test("shows only pipeline intelligence in executive group for non-executives", () => {
  assert.deepEqual(getVisibleTabIdsForGroup("executive", "recruiter"), ["pipeline-intelligence"]);
  assert.deepEqual(
    getDashboardNavGroups("recruiter").map((group) => group.id),
    ["executive", "operations", "territory-field", "admin-data"],
  );
});
