import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateP214Gates,
  p214TierForMiles,
} from "@/lib/p214-unsent-test-batch/eligibility";
import {
  P214_SEND_STATEMENT,
  evaluateP214Preflight,
} from "@/lib/p214-unsent-test-batch/preflight";
import {
  classifyP214SendHistory,
  collapseDuplicateIdentities,
  isValidNormalizedEmail,
  normalizeP214Email,
} from "@/lib/p214-unsent-test-batch/reconcile";
import {
  assertP214CohortMember,
  freezeP214Cohort,
  selectP214Cohort,
  type P214SelectableCandidate,
} from "@/lib/p214-unsent-test-batch/select";
import {
  p214NextSendDelayMs,
  p214ShouldStop,
  planP214Batches,
  summarizeP214Attempts,
} from "@/lib/p214-unsent-test-batch/send-guards";
import {
  P214_BATCH_SIZE,
  P214_MAX_COHORT_SIZE,
  type P214CandidateEvidence,
  type P214CohortMember,
  type P214GateEvidence,
  type P214PreflightInput,
  type P214SendAttempt,
} from "@/lib/p214-unsent-test-batch/types";

function evidence(overrides: Partial<P214CandidateEvidence> = {}): P214CandidateEvidence {
  return {
    candidateId: "cand-1",
    normalizedEmail: "person@example.com",
    hasName: true,
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    hasSignatureRequestId: false,
    hasPaperworkSentAt: false,
    dropboxEnvelopeStatus: null,
    inPriorSendLedger: false,
    isDuplicateIdentity: false,
    alreadyPlaced: false,
    hasActiveOnboardingEnvelope: false,
    ...overrides,
  };
}

function gate(overrides: Partial<P214GateEvidence> = {}): P214GateEvidence {
  return {
    nearestActiveWorkMiles: 10,
    hasActiveOpportunities: true,
    coverageKnown: true,
    assignedDm: "Amy Harp",
    expectedDm: "Amy Harp",
    jobCity: "Lawton",
    jobState: "OK",
    ...overrides,
  };
}

function selectable(overrides: Partial<P214SelectableCandidate> = {}): P214SelectableCandidate {
  return {
    candidateId: `cand-${Math.random().toString(36).slice(2, 8)}`,
    normalizedEmail: "person@example.com",
    positionLabel: "Merchandiser – Lawton, OK",
    workflowStatus: "Paperwork Needed",
    coverageTier: "tier1_0_20",
    nearestActiveWorkMiles: 10,
    assignedDm: "Amy Harp",
    dmCorrect: true,
    hasGeoPosting: true,
    approvedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function preflightInput(overrides: Partial<P214PreflightInput> = {}): P214PreflightInput {
  return {
    configPresent: true,
    testModeVerified: true,
    nodeEnvIsProduction: false,
    dropboxApiReachable: true,
    templateConfigured: true,
    templateFoundInAccount: true,
    signerRoleValid: true,
    cohortSize: 3,
    membersWithNewEnvelopeSincePreview: 0,
    duplicateIdempotencyKeys: 0,
    continuousAutomationActive: false,
    ...overrides,
  };
}

function attempt(overrides: Partial<P214SendAttempt> = {}): P214SendAttempt {
  return {
    candidateId: "cand-1",
    redactedCandidateId: "abc123",
    ok: true,
    status: "confirmed_test_sent",
    batch: 1,
    idempotencyKey: "key-1",
    envelopeId: "env-1",
    testModeRequested: true,
    testModeVerified: true,
    dropboxStatus: "pending",
    signerEmailMatch: true,
    detail: "",
    at: new Date().toISOString(),
    ...overrides,
  };
}

describe("P214 send-history reconciliation", () => {
  it("confirms a clean paperwork-ready candidate as UNSENT_CONFIRMED", () => {
    assert.equal(classifyP214SendHistory(evidence()), "UNSENT_CONFIRMED");
  });

  it("excludes candidates with a prior workflow envelope (signatureRequestId)", () => {
    assert.equal(
      classifyP214SendHistory(evidence({ hasSignatureRequestId: true })),
      "previously_sent_workflow",
    );
  });

  it("excludes candidates with a local Paperwork Sent record even without an envelope id", () => {
    assert.equal(
      classifyP214SendHistory(evidence({ hasPaperworkSentAt: true })),
      "previously_sent_workflow",
    );
    assert.equal(
      classifyP214SendHistory(evidence({ workflowStatus: "Paperwork Sent" })),
      "previously_sent_workflow",
    );
  });

  it("excludes signed candidates regardless of workflow stage", () => {
    assert.equal(
      classifyP214SendHistory(evidence({ dropboxEnvelopeStatus: "complete" })),
      "signed",
    );
    assert.equal(
      classifyP214SendHistory(evidence({ paperworkStatus: "signed" })),
      "signed",
    );
    assert.equal(
      classifyP214SendHistory(evidence({ dropboxEnvelopeStatus: "partially_signed" })),
      "signed",
    );
  });

  it("excludes viewed candidates", () => {
    assert.equal(classifyP214SendHistory(evidence({ dropboxEnvelopeStatus: "viewed" })), "viewed");
    assert.equal(classifyP214SendHistory(evidence({ paperworkStatus: "viewed" })), "viewed");
  });

  it("excludes pending, declined, cancelled, and expired envelopes", () => {
    for (const status of ["pending", "declined", "cancelled", "expired"] as const) {
      assert.equal(
        classifyP214SendHistory(evidence({ dropboxEnvelopeStatus: status })),
        "pending_envelope",
        status,
      );
    }
  });

  it("excludes prior-cohort ledger members even when workflow looks unsent", () => {
    assert.equal(
      classifyP214SendHistory(evidence({ inPriorSendLedger: true })),
      "prior_cohort_member",
    );
  });

  it("excludes duplicates, placed candidates, and invalid contacts", () => {
    assert.equal(
      classifyP214SendHistory(evidence({ isDuplicateIdentity: true })),
      "duplicate_identity",
    );
    assert.equal(classifyP214SendHistory(evidence({ alreadyPlaced: true })), "already_placed");
    assert.equal(
      classifyP214SendHistory(evidence({ normalizedEmail: "not-an-email" })),
      "missing_contact_info",
    );
    assert.equal(classifyP214SendHistory(evidence({ hasName: false })), "missing_contact_info");
  });

  it("excludes candidates outside authorized paperwork-ready stages", () => {
    assert.equal(
      classifyP214SendHistory(evidence({ workflowStatus: "Applied" })),
      "stage_not_authorized",
    );
    assert.equal(
      classifyP214SendHistory(evidence({ workflowStatus: "Needs Review" })),
      "stage_not_authorized",
    );
  });

  it("Dropbox envelope evidence outranks an unsent-looking workflow record", () => {
    const e = evidence({ dropboxEnvelopeStatus: "pending", workflowStatus: "Paperwork Needed" });
    assert.equal(classifyP214SendHistory(e), "pending_envelope");
  });

  it("normalizes and validates emails", () => {
    assert.equal(normalizeP214Email("  Person@Example.COM "), "person@example.com");
    assert.equal(isValidNormalizedEmail("person@example.com"), true);
    assert.equal(isValidNormalizedEmail(""), false);
    assert.equal(isValidNormalizedEmail("missing-at.example.com"), false);
  });

  it("collapses same-person multiple applications to one kept record", () => {
    const { keptIds, duplicateIds } = collapseDuplicateIdentities([
      {
        candidateId: "a",
        normalizedEmail: "x@y.com",
        approvedAt: "2026-07-02T00:00:00Z",
        stageAuthorized: true,
      },
      {
        candidateId: "b",
        normalizedEmail: "x@y.com",
        approvedAt: "2026-07-01T00:00:00Z",
        stageAuthorized: false,
      },
      {
        candidateId: "c",
        normalizedEmail: "z@y.com",
        approvedAt: "2026-07-03T00:00:00Z",
        stageAuthorized: true,
      },
    ]);
    // "a" wins over older "b" because stage-authorized records take priority.
    assert.deepEqual([...keptIds].sort(), ["a", "c"]);
    assert.deepEqual([...duplicateIds], ["b"]);
  });
});

describe("P214 coverage / routing gates", () => {
  it("maps miles to tiers with 39/60-mile boundaries", () => {
    assert.equal(p214TierForMiles(0), "tier1_0_20");
    assert.equal(p214TierForMiles(20), "tier1_0_20");
    assert.equal(p214TierForMiles(21), "tier2_21_39");
    assert.equal(p214TierForMiles(39), "tier2_21_39");
    assert.equal(p214TierForMiles(40), "review_40_60");
    assert.equal(p214TierForMiles(60), "review_40_60");
    assert.equal(p214TierForMiles(61), "out_of_range");
    assert.equal(p214TierForMiles(null), "out_of_range");
  });

  it("passes candidates with nearby work, correct DM, and geo posting", () => {
    const r = evaluateP214Gates(gate());
    assert.equal(r.eligible, true);
    assert.deepEqual(r.blockers, []);
  });

  it("blocks candidates over 60 miles and requires manual review at 40–60", () => {
    assert.deepEqual(evaluateP214Gates(gate({ nearestActiveWorkMiles: 75 })).blockers, [
      "blocked_over_60_miles",
    ]);
    assert.deepEqual(evaluateP214Gates(gate({ nearestActiveWorkMiles: 45 })).blockers, [
      "manual_review_40_60_miles",
    ]);
    assert.equal(evaluateP214Gates(gate({ nearestActiveWorkMiles: 45 })).eligible, false);
  });

  it("blocks candidates with no active work or unknown coverage", () => {
    assert.deepEqual(
      evaluateP214Gates(gate({ hasActiveOpportunities: false, nearestActiveWorkMiles: null }))
        .blockers,
      ["blocked_no_active_work"],
    );
    assert.deepEqual(
      evaluateP214Gates(gate({ coverageKnown: false, nearestActiveWorkMiles: null })).blockers,
      ["blocked_coverage_unknown"],
    );
  });

  it("blocks wrong or unassigned DM until corrected", () => {
    assert.deepEqual(evaluateP214Gates(gate({ assignedDm: "Unassigned" })).blockers, [
      "blocked_dm_unassigned",
    ]);
    assert.deepEqual(evaluateP214Gates(gate({ assignedDm: "" })).blockers, [
      "blocked_dm_unassigned",
    ]);
    assert.deepEqual(evaluateP214Gates(gate({ assignedDm: "Wrong Person" })).blockers, [
      "blocked_dm_wrong",
    ]);
  });

  it("blocks non-geographic postings unless the market was independently verified", () => {
    assert.deepEqual(evaluateP214Gates(gate({ jobCity: "", jobState: "" })).blockers, [
      "blocked_non_geographic_posting",
    ]);
    assert.equal(
      evaluateP214Gates(gate({ jobCity: "", jobState: "", marketIndependentlyVerified: true }))
        .eligible,
      true,
    );
  });

  it("collects multiple blockers instead of short-circuiting", () => {
    const r = evaluateP214Gates(
      gate({ nearestActiveWorkMiles: 80, assignedDm: "Unassigned", jobCity: "", jobState: "" }),
    );
    assert.deepEqual(r.blockers, [
      "blocked_over_60_miles",
      "blocked_dm_unassigned",
      "blocked_non_geographic_posting",
    ]);
  });
});

describe("P214 selection and cohort freezing", () => {
  it("orders Tier 1 before Tier 2, then correct DM, geo posting, oldest approval", () => {
    const tier2 = selectable({ candidateId: "t2", coverageTier: "tier2_21_39" });
    const tier1Newer = selectable({ candidateId: "t1new", approvedAt: "2026-07-10T00:00:00Z" });
    const tier1Older = selectable({ candidateId: "t1old", approvedAt: "2026-07-01T00:00:00Z" });
    const picked = selectP214Cohort([tier2, tier1Newer, tier1Older]);
    assert.deepEqual(
      picked.map((c) => c.candidateId),
      ["t1old", "t1new", "t2"],
    );
  });

  it("never selects more than 20 candidates even when asked for more", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      selectable({ candidateId: `c${String(i).padStart(2, "0")}` }),
    );
    assert.equal(selectP214Cohort(many).length, P214_MAX_COHORT_SIZE);
    assert.equal(selectP214Cohort(many, 99).length, P214_MAX_COHORT_SIZE);
    assert.equal(selectP214Cohort(many, 5).length, 5);
  });

  it("never selects manual-review or out-of-range candidates", () => {
    const picked = selectP214Cohort([
      selectable({ candidateId: "review", coverageTier: "review_40_60" }),
      selectable({ candidateId: "far", coverageTier: "out_of_range" }),
      selectable({ candidateId: "ok" }),
    ]);
    assert.deepEqual(
      picked.map((c) => c.candidateId),
      ["ok"],
    );
  });

  it("freezes the cohort with unique idempotency keys and redacted ids", () => {
    const cohort = freezeP214Cohort({
      selected: [selectable({ candidateId: "a" }), selectable({ candidateId: "b" })],
      authorizedBy: "operator-p214",
    });
    assert.equal(cohort.sendMode, "test_mode");
    assert.equal(cohort.members.length, 2);
    const keys = new Set(cohort.members.map((m) => m.idempotencyKey));
    assert.equal(keys.size, 2);
    for (const m of cohort.members) {
      assert.equal(m.redactedCandidateId.length, 12);
      assert.notEqual(m.redactedCandidateId, m.candidateId);
      assert.equal(m.idempotencyKey.length, 32);
    }
  });

  it("refuses to freeze a cohort larger than 20", () => {
    const many = Array.from({ length: 21 }, (_, i) => selectable({ candidateId: `c${i}` }));
    assert.throws(
      () => freezeP214Cohort({ selected: many, authorizedBy: "operator-p214" }),
      /cannot exceed 20/,
    );
  });

  it("prevents any candidate outside the frozen cohort from being sent", () => {
    const cohort = freezeP214Cohort({
      selected: [selectable({ candidateId: "inside" })],
      authorizedBy: "operator-p214",
    });
    assert.doesNotThrow(() => assertP214CohortMember(cohort, "inside"));
    assert.throws(() => assertP214CohortMember(cohort, "outside"), /not in frozen cohort/);
  });
});

describe("P214 mandatory preflight", () => {
  it("passes when every check is green", () => {
    const r = evaluateP214Preflight(preflightInput());
    assert.equal(r.ok, true);
    assert.deepEqual(r.failures, []);
  });

  it("stops when test mode cannot be positively verified", () => {
    const r = evaluateP214Preflight(preflightInput({ testModeVerified: false }));
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => f.includes("test_mode=true")));
  });

  it("rejects production mode outright", () => {
    const r = evaluateP214Preflight(preflightInput({ nodeEnvIsProduction: true }));
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => f.includes("production mode")));
  });

  it("rejects oversized cohorts, post-preview envelopes, and duplicate keys", () => {
    assert.equal(evaluateP214Preflight(preflightInput({ cohortSize: 21 })).ok, false);
    assert.equal(
      evaluateP214Preflight(preflightInput({ membersWithNewEnvelopeSincePreview: 1 })).ok,
      false,
    );
    assert.equal(
      evaluateP214Preflight(preflightInput({ duplicateIdempotencyKeys: 1 })).ok,
      false,
    );
  });

  it("rejects unavailable API, missing template, invalid signer role, and active automation", () => {
    assert.equal(evaluateP214Preflight(preflightInput({ dropboxApiReachable: false })).ok, false);
    assert.equal(evaluateP214Preflight(preflightInput({ templateConfigured: false })).ok, false);
    assert.equal(
      evaluateP214Preflight(preflightInput({ templateFoundInAccount: false })).ok,
      false,
    );
    assert.equal(evaluateP214Preflight(preflightInput({ signerRoleValid: false })).ok, false);
    assert.equal(
      evaluateP214Preflight(preflightInput({ continuousAutomationActive: true })).ok,
      false,
    );
  });

  it("declares the non-binding test-mode statement verbatim", () => {
    assert.equal(
      P214_SEND_STATEMENT,
      "P214 will send up to 20 Dropbox Sign test-mode envelopes. These envelopes are not legally binding and do not count as production paperwork.",
    );
  });
});

describe("P214 controlled send guards", () => {
  const members = Array.from({ length: 12 }, (_, i) =>
    ({ candidateId: `c${i}` }) as unknown as P214CohortMember,
  );

  it("plans batches of at most 5", () => {
    const batches = planP214Batches(members);
    assert.deepEqual(
      batches.map((b) => b.length),
      [5, 5, 2],
    );
    // A larger requested batch size is clamped to the P214 maximum.
    assert.equal(planP214Batches(members, 50)[0]!.length, P214_BATCH_SIZE);
  });

  it("enforces the ≤4 requests/minute rate", () => {
    assert.equal(p214NextSendDelayMs(0, 1_000), 0);
    assert.equal(p214NextSendDelayMs(100_000, 105_000), 10_000);
    assert.equal(p214NextSendDelayMs(100_000, 130_000), 0);
  });

  it("stops immediately on a send failure but not on duplicate-prevention skips", () => {
    assert.equal(p214ShouldStop(attempt({ status: "send_failed", ok: false })), true);
    assert.equal(p214ShouldStop(attempt({ status: "skipped_existing_envelope" })), false);
    assert.equal(p214ShouldStop(attempt({ status: "confirmed_test_sent" })), false);
  });

  it("summarizes attempts including duplicate prevention and test-mode verification", () => {
    const summary = summarizeP214Attempts([
      attempt(),
      attempt({ candidateId: "c2", envelopeId: "env-2", dropboxStatus: "viewed" }),
      attempt({
        candidateId: "c3",
        status: "skipped_existing_envelope",
        ok: true,
        envelopeId: "old-env",
      }),
      attempt({ candidateId: "c4", status: "send_failed", ok: false, envelopeId: null }),
    ]);
    assert.equal(summary.attempted, 4);
    assert.equal(summary.confirmed, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(summary.duplicatePrevented, 1);
    assert.equal(summary.existingEnvelopeDiscovered, 1);
    assert.equal(summary.viewed, 1);
    assert.equal(summary.requestIdsPresent, 2);
    assert.equal(summary.testModeVerifiedCount, 2);
    assert.equal(summary.candidatesOutsideCohortTouched, 0);
  });

  it("counts unverified test mode as not verified", () => {
    const summary = summarizeP214Attempts([attempt({ testModeVerified: null })]);
    assert.equal(summary.testModeVerifiedCount, 0);
  });
});
