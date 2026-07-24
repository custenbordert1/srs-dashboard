import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  P224_EXCLUDED_P221_IDS,
  P224_EXPECTED_TEMPLATE,
  P224_MAX_COHORT_SIZE,
  assertP224SelectionSafe,
  buildP224SelectionResult,
  evaluateP224BaseEligibility,
  evaluateP224ProximityGates,
  freezeP224Preview,
  selectP224Cohort,
  type P224PreviewCandidate,
} from "@/lib/p224-controlled-preview";

function eligibleRow(
  candidateId: string,
  patch: Partial<P224PreviewCandidate> = {},
): P224PreviewCandidate {
  return {
    candidateId,
    name: `Name ${candidateId}`,
    email: `${candidateId}@example.com`,
    location: "Columbus, OH",
    city: "Columbus",
    state: "OH",
    assignedDM: "Mindie Rodriguez",
    assignedRecruiter: "Unassigned",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    listMembershipSource: "ingestion",
    nearestActiveWorkMiles: 5,
    coverageTier: "tier1_0_20",
    eligibilityResult: "eligible",
    eligibilityBlockers: [],
    expectedTemplate: P224_EXPECTED_TEMPLATE,
    approvedAt: "2026-07-01T00:00:00.000Z",
    positionLabel: "Retail Merchandiser",
    dmCorrect: true,
    hasGeoPosting: true,
    ...patch,
  };
}

describe("P224 base eligibility", () => {
  it("passes for Paperwork Needed + not_sent + DM + email", () => {
    const result = evaluateP224BaseEligibility({
      candidateId: "cand1",
      inInboxUnion: true,
      workflowStatus: "Paperwork Needed",
      paperworkStatus: "not_sent",
      signatureRequestId: null,
      assignedDM: "Amy Harp",
      email: "a@example.com",
      name: "Ada Lovelace",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.reasons, []);
  });

  it("excludes P221 targets", () => {
    const result = evaluateP224BaseEligibility({
      candidateId: P224_EXCLUDED_P221_IDS[0],
      inInboxUnion: true,
      workflowStatus: "Paperwork Needed",
      paperworkStatus: "not_sent",
      signatureRequestId: null,
      assignedDM: "Mindie Rodriguez",
      email: "a@example.com",
      name: "John Henry White",
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes("p221_excluded"));
  });

  it("blocks missing email, signature, wrong stage, unassigned DM", () => {
    const result = evaluateP224BaseEligibility({
      candidateId: "x1",
      inInboxUnion: true,
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "sent",
      signatureRequestId: "sig_1",
      assignedDM: "Unassigned",
      email: "",
      name: "Someone",
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes("stage_not_paperwork_needed"));
    assert.ok(result.reasons.includes("paperwork_already_sent"));
    assert.ok(result.reasons.includes("signature_request_present"));
    assert.ok(result.reasons.includes("dm_unassigned_or_missing"));
    assert.ok(result.reasons.includes("missing_email"));
  });
});

describe("P224 proximity gates", () => {
  it("passes tier1 with matching DM and geo posting", () => {
    const gates = evaluateP224ProximityGates({
      nearestActiveWorkMiles: 8,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Amy Harp",
      expectedDm: "Amy Harp",
      jobCity: "Kansas City",
      jobState: "MO",
    });
    assert.equal(gates.ok, true);
    assert.equal(gates.tier, "tier1_0_20");
  });

  it("fails over-range and wrong DM", () => {
    const gates = evaluateP224ProximityGates({
      nearestActiveWorkMiles: 75,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Wrong DM",
      expectedDm: "Amy Harp",
      jobCity: "Kansas City",
      jobState: "MO",
    });
    assert.equal(gates.ok, false);
    assert.ok(gates.blockers.includes("blocked_over_60_miles"));
    assert.ok(gates.blockers.includes("blocked_dm_wrong"));
  });
});

describe("P224 selection + abort guards", () => {
  it("selects at most 20 and prefers tier1", () => {
    const rows = [
      eligibleRow("t2a", { coverageTier: "tier2_21_39", nearestActiveWorkMiles: 25 }),
      eligibleRow("t1a", { coverageTier: "tier1_0_20", nearestActiveWorkMiles: 3 }),
      eligibleRow("t1b", {
        coverageTier: "tier1_0_20",
        nearestActiveWorkMiles: 4,
        approvedAt: "2026-06-01T00:00:00.000Z",
      }),
    ];
    const selected = selectP224Cohort(rows, 2);
    assert.equal(selected.length, 2);
    assert.equal(selected[0]!.candidateId, "t1b");
    assert.equal(selected[1]!.candidateId, "t1a");
  });

  it("aborts when selected cohort exceeds max", () => {
    const many = Array.from({ length: 21 }, (_, i) => eligibleRow(`c${i}`));
    // Force unsafe path via assert directly
    const safety = assertP224SelectionSafe(many, P224_MAX_COHORT_SIZE);
    assert.equal(safety.ok, false);
  });

  it("aborts when a selected row has a signature request", () => {
    const safety = assertP224SelectionSafe(
      [eligibleRow("bad", { signatureRequestId: "sig_x" })],
      P224_MAX_COHORT_SIZE,
    );
    assert.equal(safety.ok, false);
  });

  it("aborts on duplicate IDs", () => {
    const safety = assertP224SelectionSafe(
      [eligibleRow("dup"), eligibleRow("dup")],
      P224_MAX_COHORT_SIZE,
    );
    assert.equal(safety.ok, false);
  });

  it("aborts when P221 id slips into selection", () => {
    const safety = assertP224SelectionSafe(
      [eligibleRow(P224_EXCLUDED_P221_IDS[0])],
      P224_MAX_COHORT_SIZE,
    );
    assert.equal(safety.ok, false);
  });

  it("builds a preview-only frozen cohort", () => {
    const result = buildP224SelectionResult({
      evaluatedCount: 3,
      eligible: [eligibleRow("a"), eligibleRow("b")],
      exclusionsByReason: { missing_email: 1 },
      now: new Date("2026-07-20T15:00:00.000Z"),
    });
    assert.equal(result.aborted, false);
    if (result.aborted) return;
    assert.equal(result.selected.length, 2);
    assert.equal(result.cohort.previewOnly, true);
    assert.equal(result.cohort.members[0]!.expectedTemplate, "onboarding_packet");
    const frozen = freezeP224Preview({
      selected: result.selected,
      now: new Date("2026-07-20T15:00:00.000Z"),
    });
    assert.equal(frozen.phase, "P224");
    assert.ok(frozen.cohortId.startsWith("p224-preview-"));
  });

  it("does not select review/out-of-range tiers", () => {
    const selected = selectP224Cohort([
      eligibleRow("far", { coverageTier: "out_of_range", nearestActiveWorkMiles: 90 }),
      eligibleRow("review", { coverageTier: "review_40_60", nearestActiveWorkMiles: 45 }),
    ]);
    assert.equal(selected.length, 0);
  });
});
