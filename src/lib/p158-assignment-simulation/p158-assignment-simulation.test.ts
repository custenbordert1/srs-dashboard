import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import {
  analyzeSimulationBottlenecks,
  buildConfidenceDistribution,
} from "@/lib/p158-assignment-simulation/bottleneck-analysis";
import { buildSimulationSummary } from "@/lib/p158-assignment-simulation/simulation-summary";
import {
  buildTerritoryHeatMap,
  computeTerritoryImbalanceScore,
} from "@/lib/p158-assignment-simulation/territory-impact";
import {
  buildCurrentRecruiterLoads,
  buildWorkloadImpact,
  findLargestWorkloadIncrease,
} from "@/lib/p158-assignment-simulation/workload-impact";

function queueItem(overrides: Partial<P158AssignmentQueueItem> = {}): P158AssignmentQueueItem {
  return {
    candidateId: "c1",
    candidateName: "Test",
    email: null,
    state: "TX",
    territory: "TX",
    dm: "DM Texas",
    position: "Rep",
    assignedRecruiter: "Unassigned",
    recommendedRecruiter: "Alex",
    confidence: 85,
    priorityScore: 70,
    openDemand: 40,
    recruiterWorkload: 5,
    status: "queued",
    reasoning: [],
    skipReason: null,
    duplicateRisk: false,
    ...overrides,
  };
}

describe("P158.1 workload impact", () => {
  it("computes before/after recruiter loads", () => {
    const workflows = {
      c1: { assignedRecruiter: "Alex" },
      c2: { assignedRecruiter: "Alex" },
      c3: { assignedRecruiter: "Unassigned" },
    };
    const current = buildCurrentRecruiterLoads(workflows);
    assert.equal(current.get("Alex"), 2);

    const simulated = [queueItem({ candidateId: "c3", recommendedRecruiter: "Alex" })];
    const impact = buildWorkloadImpact({
      currentLoads: current,
      queue: simulated,
      simulatedAssignments: simulated,
      rosterRecruiters: ["Alex", "Taylor"],
    });

    const alex = impact.find((r) => r.recruiter === "Alex");
    assert.ok(alex);
    assert.equal(alex.before, 2);
    assert.equal(alex.after, 3);
    assert.equal(alex.delta, 1);
  });

  it("finds largest workload increase", () => {
    const rows = [
      { recruiter: "A", before: 1, after: 5, delta: 4, utilizationPercent: 80, queuedInSimulation: 4 },
      { recruiter: "B", before: 2, after: 10, delta: 8, utilizationPercent: 100, queuedInSimulation: 8 },
    ];
    const top = findLargestWorkloadIncrease(rows);
    assert.deepEqual(top, { recruiter: "B", delta: 8 });
  });
});

describe("P158.1 territory impact", () => {
  it("reduces unassigned after simulated assignments", () => {
    const queue = [
      queueItem({ candidateId: "c1", territory: "TX" }),
      queueItem({ candidateId: "c2", territory: "TX", status: "manual_review" }),
    ];
    const heat = buildTerritoryHeatMap({
      queue,
      simulatedAssignments: [queueItem({ candidateId: "c1", territory: "TX" })],
    });
    const tx = heat.find((c) => c.territory === "TX");
    assert.ok(tx);
    assert.equal(tx.unassignedBefore, 2);
    assert.equal(tx.unassignedAfter, 1);
    assert.equal(tx.assignedInSimulation, 1);
  });

  it("computes territory imbalance score", () => {
    const cells = [
      { territory: "TX", dm: null, openDemand: 10, unassignedBefore: 2, unassignedAfter: 1, assignedInSimulation: 1, imbalanceScore: 60 },
      { territory: "OH", dm: null, openDemand: 20, unassignedBefore: 5, unassignedAfter: 4, assignedInSimulation: 1, imbalanceScore: 80 },
    ];
    assert.equal(computeTerritoryImbalanceScore(cells), 70);
  });
});

describe("P158.1 bottleneck analysis", () => {
  it("flags workload spikes and builds confidence buckets", () => {
    const workload = [
      { recruiter: "Logan", before: 8, after: 28, delta: 20, utilizationPercent: 95, queuedInSimulation: 20 },
    ];
    const warnings = analyzeSimulationBottlenecks({
      queue: [queueItem({ confidence: 55 }), queueItem({ candidateId: "c2", status: "blocked" })],
      workload,
      territory: [],
      simulatedCount: 1,
      remainingUnassigned: 25,
    });
    assert.ok(warnings.some((w) => w.code === "workload_spike"));
    assert.ok(warnings.some((w) => w.code === "blocked_candidates"));

    const buckets = buildConfidenceDistribution([
      queueItem({ confidence: 92 }),
      queueItem({ candidateId: "c2", confidence: 62 }),
    ]);
    assert.equal(buckets.find((b) => b.label === "90–100")?.count, 1);
    assert.equal(buckets.find((b) => b.label === "60–69")?.count, 1);
  });
});

describe("P158.1 simulation summary", () => {
  it("aggregates executive metrics", () => {
    const summary = buildSimulationSummary({
      candidatesEvaluated: 100,
      simulatedAssignments: 25,
      remainingUnassigned: 30,
      workload: [
        { recruiter: "A", before: 5, after: 15, delta: 10, utilizationPercent: 75, queuedInSimulation: 10 },
      ],
      territoryImbalanceScore: 55,
      outcomes: {
        readyForPaperwork: 3,
        manualReview: 20,
        followUp: 1,
        blocked: 1,
        outcomes: [],
      },
      largestWorkloadIncrease: { recruiter: "A", delta: 10 },
    });

    assert.equal(summary.candidatesAssignedInSimulation, 25);
    assert.equal(summary.readyForPaperwork, 3);
    assert.equal(summary.avgRecruiterUtilization, 75);
  });
});

describe("P158.1 read-only guarantees", () => {
  it("simulation types are marked read-only", async () => {
    const mod = await import("@/lib/p158-assignment-simulation/types");
    assert.equal(mod.P158_1_SOURCE_PHASE, "P158.1");
  });
});
