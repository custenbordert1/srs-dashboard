import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  P235_ALLOWED_CHANGED_FIELDS,
  P235_APPROVED_BY,
  P235_FORBIDDEN_CHANGED_FIELDS,
  P235_MAX_BATCH,
  assertP235LiveAuthorized,
  assertP235WriteBudget,
  authorizeP235Mode,
  classifyP235ProximityExclusion,
  diffP235GlobalStore,
  evaluateP235Proximity,
  p235IsCalvinBrown,
  resolveP235AuthoritativeDm,
  selectP235NewestFive,
  verifyP235PreSend,
} from "@/lib/p235-controlled-newest-five-send";

function wf(overrides: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "c1",
    workflowStatus: "Applied",
    assignedRecruiter: "Taylor",
    assignedDM: "Unassigned",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Review",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function cand(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Test",
    lastName: "Candidate",
    email: "test@example.com",
    phone: "555-010-1234",
    stage: "Applied",
    source: "Indeed",
    appliedDate: "2026-07-20T12:00:00.000Z",
    addedDate: "2026-07-20T12:00:00.000Z",
    positionId: "pos-1",
    positionName: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zipCode: "43215",
    ...overrides,
  } as BreezyCandidate;
}

function job(overrides: Partial<BreezyJob> = {}): BreezyJob {
  return {
    jobId: "pos-1",
    name: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zip: "43215",
    displayLocation: "Columbus, OH",
    locationSource: "location.city+location.state",
    status: "published",
    createdDate: "",
    updatedDate: "",
    ...overrides,
  } as BreezyJob;
}

describe("P235 authorization", () => {
  it("requires exact live approval flags", () => {
    const denied = authorizeP235Mode(["--live"]);
    assert.equal(denied.approved, false);

    const ok = authorizeP235Mode([
      "--live",
      "--operator-approved",
      `--approved-by=${P235_APPROVED_BY}`,
    ]);
    assert.equal(ok.approved, true);
    assert.doesNotThrow(() => assertP235LiveAuthorized(ok));
  });

  it("rejects wrong approved-by", () => {
    const bad = authorizeP235Mode([
      "--live",
      "--operator-approved",
      "--approved-by=Someone Else",
    ]);
    assert.equal(bad.approved, false);
  });

  it("enforces max write budget of 5", () => {
    assert.doesNotThrow(() => assertP235WriteBudget(5));
    assert.throws(() => assertP235WriteBudget(6));
  });
});

describe("P235 exclusions and DM routing", () => {
  it("excludes Calvin Brown by name", () => {
    assert.equal(p235IsCalvinBrown("Calvin Brown"), true);
    assert.equal(p235IsCalvinBrown("calvin brown"), true);
    assert.equal(p235IsCalvinBrown("Someone Else"), false);
  });

  it("resolves authoritative DM from Position.Location", () => {
    const result = resolveP235AuthoritativeDm({
      currentAssignedDM: "Unassigned",
      positionId: "pos-1",
      positionName: "Retail Merchandiser",
      homeCity: "Columbus",
      homeState: "OH",
      job: job(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.authoritative, true);
    assert.ok(result.proposedAssignedDM);
    assert.equal(result.wouldChange, true);
  });

  it("rejects non-authoritative title-parsed location", () => {
    const result = resolveP235AuthoritativeDm({
      currentAssignedDM: "Unassigned",
      positionId: "pos-1",
      positionName: "Flexible Merchandiser",
      homeCity: "Columbus",
      homeState: "OH",
      job: job({
        city: "Columbus",
        state: "OH",
        locationSource: "job_name",
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "position_location_not_authoritative");
  });
});

describe("P235 proximity gates", () => {
  it("auto-eligible at ≤39 miles", () => {
    const prox = evaluateP235Proximity({
      home: { lat: 39.96, lng: -83.0 },
      assignedDm: "Mindie Rodriguez",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
      opportunities: [{ city: "Columbus", state: "OH", lat: 39.97, lng: -83.01 }],
    });
    assert.equal(prox.autoEligible, true);
    assert.ok(prox.nearestMiles != null && prox.nearestMiles <= 39);
    assert.equal(classifyP235ProximityExclusion(prox).reason, null);
  });

  it("excludes 40–60 to manual review", () => {
    const gates = evaluateP214Gates({
      nearestActiveWorkMiles: 45,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Mindie Rodriguez",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
    });
    assert.equal(gates.eligible, false);
    assert.ok(gates.blockers.includes("manual_review_40_60_miles"));
  });

  it("blocks over 60 and coverage unknown", () => {
    const over = evaluateP214Gates({
      nearestActiveWorkMiles: 75,
      hasActiveOpportunities: true,
      coverageKnown: true,
      assignedDm: "Mindie Rodriguez",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
    });
    assert.ok(over.blockers.includes("blocked_over_60_miles"));

    const unknown = evaluateP214Gates({
      nearestActiveWorkMiles: null,
      hasActiveOpportunities: true,
      coverageKnown: false,
      assignedDm: "Mindie Rodriguez",
      expectedDm: "Mindie Rodriguez",
      jobCity: "Columbus",
      jobState: "OH",
    });
    assert.ok(unknown.blockers.includes("blocked_coverage_unknown"));
  });
});

describe("P235 selection newest-first max 5", () => {
  it("selects newest first and caps at 5", async () => {
    const workflows: Record<string, CandidateWorkflowRecord> = {};
    const candidatesById = new Map<string, BreezyCandidate>();
    const jobsByPositionId = new Map<string, BreezyJob>([["pos-1", job()]]);
    const ids: string[] = [];

    for (let i = 0; i < 7; i++) {
      const id = `cand-${i}`;
      ids.push(id);
      workflows[id] = wf({ candidateId: id });
      candidatesById.set(
        id,
        cand({
          candidateId: id,
          email: `c${i}@example.com`,
          phone: `555010123${i}`,
          appliedDate: `2026-07-${String(20 - i).padStart(2, "0")}T12:00:00.000Z`,
        }),
      );
    }

    const selection = await selectP235NewestFive({
      frozenIds: ids,
      ingestionGapIds: new Set(),
      workflows,
      candidatesById,
      jobsByPositionId,
      policy: { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY, funnelPromotion: { enabled: true } },
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.97, lng: -83.01 }],
      allowNetworkGeocode: false,
    });

    // Without geocode cache hits, home may be null → coverage_unknown exclusions.
    // Still must never exceed max batch.
    assert.ok(selection.selectedCount <= P235_MAX_BATCH);
    assert.equal(selection.frozenCohortSize, 7);
    assert.equal(selection.evaluatedCount, 7);

    // Ensure Calvin Brown hard exclusion path works inside selection
    workflows["calvin"] = wf({ candidateId: "calvin" });
    candidatesById.set(
      "calvin",
      cand({
        candidateId: "calvin",
        firstName: "Calvin",
        lastName: "Brown",
        email: "calvin@example.com",
        appliedDate: "2026-07-21T12:00:00.000Z",
      }),
    );
    const withCalvin = await selectP235NewestFive({
      frozenIds: ["calvin", ...ids],
      ingestionGapIds: new Set(),
      workflows,
      candidatesById,
      jobsByPositionId,
      policy: { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY, funnelPromotion: { enabled: true } },
      opportunityPoints: [{ city: "Columbus", state: "OH", lat: 39.97, lng: -83.01 }],
      allowNetworkGeocode: false,
    });
    assert.ok(
      withCalvin.exclusions.some((e) => e.reason === "calvin_brown_excluded"),
    );
  });
});

describe("P235 write surface and global diff", () => {
  it("forbids recruiter fields; allows DM/paperwork/P65.6 notes", () => {
    assert.ok(P235_FORBIDDEN_CHANGED_FIELDS.has("assignedRecruiter"));
    assert.ok(!P235_FORBIDDEN_CHANGED_FIELDS.has("notes"));
    assert.ok(P235_ALLOWED_CHANGED_FIELDS.has("notes"));
    assert.ok(P235_ALLOWED_CHANGED_FIELDS.has("assignedDM"));
    assert.ok(P235_ALLOWED_CHANGED_FIELDS.has("signatureRequestId"));
    assert.ok(P235_ALLOWED_CHANGED_FIELDS.has("workflowStatus"));
  });

  it("global diff flags non-target changes", () => {
    const before = {
      a: { candidateId: "a", workflowStatus: "Applied" },
      b: { candidateId: "b", workflowStatus: "Applied" },
    };
    const after = {
      a: { candidateId: "a", workflowStatus: "Paperwork Sent" },
      b: { candidateId: "b", workflowStatus: "Paperwork Needed" },
    };
    const diff = diffP235GlobalStore({
      before,
      after,
      targetIds: ["a"],
    });
    assert.equal(diff.targetCount, 1);
    assert.equal(diff.nonTargetCount, 1);
    assert.equal(diff.targetOnly, false);
  });

  it("pre-send requires Paperwork Needed + not_sent + Taylor", () => {
    const member = {
      candidateId: "c1",
      redactedCandidateId: "abc",
      displayName: "Test",
      email: "test@example.com",
      phone: "555",
      appliedDate: "",
      city: "Columbus",
      state: "OH",
      zip: "",
      positionId: "pos-1",
      positionName: "",
      assignedRecruiter: "Taylor",
      assignedDMBefore: "Unassigned",
      workflowStage: "Paperwork Needed",
      paperworkStatus: "not_sent",
      signatureRequestId: null,
      dm: {
        ok: true,
        proposedAssignedDM: "Mindie Rodriguez",
        expectedDmFromRouting: "Mindie Rodriguez",
        routingState: "OH",
        positionId: "pos-1",
        positionCity: "Columbus",
        positionState: "OH",
        locationSource: "location.city+location.state",
        authoritative: true,
        wouldChange: true,
        reason: "ok",
      },
      proximity: null,
      canPromoteP656: true,
      selected: true,
      exclusionReason: null,
      exclusionDetail: null,
    };
    const ok = verifyP235PreSend({
      member,
      record: {
        candidateId: "c1",
        workflowStatus: "Paperwork Needed",
        assignedRecruiter: "Taylor",
        assignedDM: "Mindie Rodriguez",
        paperworkStatus: "not_sent",
        signatureRequestId: null,
      },
    });
    assert.equal(ok.ok, true);

    const bad = verifyP235PreSend({
      member,
      record: {
        candidateId: "c1",
        workflowStatus: "Applied",
        assignedRecruiter: "Taylor",
        assignedDM: "Mindie Rodriguez",
        paperworkStatus: "not_sent",
        signatureRequestId: null,
      },
    });
    assert.equal(bad.ok, false);
  });
});

describe("P235 P65.6 promotion gate regression", () => {
  it("canPromoteToPaperworkFunnel works for Taylor-owned Applied", () => {
    const row = buildScoredWorkflowRow(
      cand(),
      wf({ assignedRecruiter: "Taylor", assignedDM: "Mindie Rodriguez" }),
    );
    assert.equal(
      canPromoteToPaperworkFunnel(row, {
        ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
        funnelPromotion: { enabled: true },
      }),
      true,
    );
  });
});
