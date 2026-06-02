import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DM_TERRITORY_ASSIGNMENTS } from "@/lib/dm-portal/dm-territory-assignments";
import {
  getDmViewVisibility,
  isDmViewModeEnabled,
  resolveDmViewModeFromUser,
} from "@/lib/dm-portal/dm-view-mode";
import { buildDmPortalCardMetrics } from "@/lib/dm-portal/dm-portal-metrics";
import { isDistrictManagerPortalRole, toPortalRole } from "@/lib/dm-portal/roles";
import {
  filterByTerritoryStates,
  isStateInTerritory,
} from "@/lib/dm-portal/territory-filter-service";
import { getAssignedStatesForDm, getDmForState } from "@/lib/dm-territory-map";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";

describe("dm-portal", () => {
  it("maps portal roles from auth roles without changing UserRole", () => {
    assert.equal(toPortalRole("admin"), "Admin");
    assert.equal(toPortalRole("recruiter"), "Recruiter");
    assert.equal(toPortalRole("dm"), "DistrictManager");
    assert.ok(isDistrictManagerPortalRole("dm"));
    assert.ok(isDistrictManagerPortalRole("district_manager"));
  });

  it("enables DM view mode for district managers", () => {
    assert.equal(isDmViewModeEnabled({ role: "dm" }), true);
    assert.equal(isDmViewModeEnabled({ role: "admin" }), false);
    assert.equal(isDmViewModeEnabled({ role: "admin", preview: true }), true);
    const visibility = getDmViewVisibility({ enabled: true, portalRole: "district_manager", territoryStates: ["TX"] });
    assert.equal(visibility.hideFullCandidateDatabase, true);
    assert.equal(visibility.showOpenJobs, true);
  });

  it("resolves view mode from user", () => {
    const state = resolveDmViewModeFromUser({
      id: "1",
      email: "a@b.com",
      name: "Amy Harp",
      role: "dm",
      dmName: "Amy Harp",
      territoryStates: ["TX"],
      active: true,
      createdAt: "",
      updatedAt: "",
    });
    assert.equal(state.enabled, true);
    assert.equal(state.portalRole, "district_manager");
  });

  it("filters rows by territory states", () => {
    const rows = [
      { state: "TX", id: 1 },
      { state: "CA", id: 2 },
    ];
    const filtered = filterByTerritoryStates(rows, ["TX", "OK"]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, 1);
    assert.ok(isStateInTerritory("tx", ["TX"]));
  });

  it("uses canonical DM territory assignments", () => {
    for (const [dm, states] of Object.entries(DM_TERRITORY_ASSIGNMENTS)) {
      for (const state of states) {
        assert.equal(getDmForState(state), dm);
        assert.ok(getAssignedStatesForDm(dm).includes(state));
      }
    }
  });

  it("derives portal card metrics from dashboard snapshot", () => {
    const snapshot = {
      activeJobs: 4,
      candidatesLast7Days: 9,
      health: { score: 72, label: "Stable", factors: [] },
      coverage: { candidateShortagesByState: [{ label: "TX", value: 3 }], topProblemCities: [], hardestToFillTerritories: [], hiringVelocityTrends: [] },
      melMatching: { unstaffedHighPriorityStores: [], bestCandidateForOpenProjects: [], candidatesNearAgingOpportunities: [] },
      onboarding: { paperworkSigned: 2, ddApproved: 1, paperworkSent: 0, ddNotRequested: 0, ddRequested: 0, ddReceived: 0, awaitingDdVerification: 0 },
      pipeline: { counts: { applied: 0, interviewing: 0, hired: 1, stalled: 0 }, applied: [], interviewing: [], hired: [], stalled: [] },
      alertSummary: { criticalCount: 1, highCount: 2, mediumCount: 0, lowCount: 0, agingJobsCount: 0, zeroApplicantJobsCount: 0, territoryRecruitingRiskScore: 0 },
    } as unknown as DmDashboardSnapshot;
    const metrics = buildDmPortalCardMetrics(snapshot);
    assert.equal(metrics.openJobs, 4);
    assert.equal(metrics.applicants, 9);
    assert.equal(metrics.openCalls, 3);
    assert.equal(metrics.activeReps, 4);
    assert.equal(metrics.coveragePercent, 72);
    assert.equal(metrics.needsAttention, 3);
  });
});
