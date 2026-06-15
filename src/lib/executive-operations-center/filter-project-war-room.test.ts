import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PROJECT_WAR_ROOM_FILTERS,
  filterProjectWarRoomRows,
} from "@/lib/executive-operations-center/filter-project-war-room";
import type { ExecutiveProjectWarRoomRow } from "@/lib/executive-operations-center/types";

const sample: ExecutiveProjectWarRoomRow[] = [
  {
    opportunityId: "1",
    projectName: "A",
    client: "Walmart",
    state: "TX",
    dmName: "Amy Harp",
    openCalls: 1,
    coveragePercent: 40,
    applicantCount: 3,
    riskLevel: "critical",
    owner: "Amy Harp",
    recommendation: "Staff",
  },
  {
    opportunityId: "2",
    projectName: "B",
    client: "Target",
    state: "FL",
    dmName: "Other DM",
    openCalls: 1,
    coveragePercent: 80,
    applicantCount: 10,
    riskLevel: "healthy",
    owner: "Other DM",
    recommendation: "Monitor",
  },
];

describe("project war room filters", () => {
  it("returns all rows with default filters", () => {
    assert.equal(filterProjectWarRoomRows(sample, DEFAULT_PROJECT_WAR_ROOM_FILTERS).length, 2);
  });

  it("filters by client and risk together", () => {
    const rows = filterProjectWarRoomRows(sample, {
      ...DEFAULT_PROJECT_WAR_ROOM_FILTERS,
      client: "Walmart",
      risk: "critical",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.projectName, "A");
  });
});
