import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessDataQuality,
  assessDropboxHealth,
  assessEligibility,
  assessGeography,
  assessRecruiterHealth,
  assessDmHealth,
  buildP228Assessment,
  buildP228OperationalDashboard,
  buildPipelineInventory,
  decideGoNoGo,
  evaluateP228EligibilityBlockers,
  formatP228MarkdownReport,
  isP228SendEligible,
  recommendScale,
  assessRisk,
  P228_EXECUTION_MODE,
  P228_PHASE,
  type P228CandidateSnapshot,
  type P228HistoricalContext,
} from "@/lib/p228-production-readiness";

const HISTORICAL: P228HistoricalContext = {
  p219_p221ControlledSendsSucceeded: true,
  p223InboxRestored: true,
  p224InitialEligible: 1,
  p226RecoveredEligible: 3,
  p227LiveSendsSucceeded: 3,
  p227SideEffects: 0,
  p227TestMode: true,
  p227TargetRedactedIds: ["4b612c1f1596", "3e9857472d98", "b1216fa993ac"],
};

function snap(overrides: Partial<P228CandidateSnapshot> = {}): P228CandidateSnapshot {
  return {
    candidateId: "cand-1",
    redactedCandidateId: "aaaaaaaaaaaa",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "5551234567",
    city: "Austin",
    state: "TX",
    zip: "78701",
    positionId: "pos-1",
    positionName: "Retail Merchandiser",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    assignedDM: "Amy Harp",
    assignedRecruiter: "Recruiting Team",
    listMembershipSource: "ingestion",
    nearestActiveWorkMiles: 5,
    coverageKnown: true,
    coverageTier: "tier1_0_20",
    isDuplicate: false,
    recoveredIdentity: false,
    recoveredEmail: false,
    recoveredDm: false,
    inRecoveryStore: false,
    ...overrides,
  };
}

describe("P228 eligibility gates", () => {
  it("marks a fully gated Paperwork Needed candidate eligible", () => {
    const c = snap();
    assert.equal(isP228SendEligible(c), true);
    assert.deepEqual(evaluateP228EligibilityBlockers(c), []);
  });

  it("allows Unassigned recruiter for send eligibility (P227 pattern) but still counts blocker", () => {
    const c = snap({ assignedRecruiter: "Unassigned" });
    assert.equal(isP228SendEligible(c), true);
    assert.ok(evaluateP228EligibilityBlockers(c).includes("missing_recruiter"));
  });

  it("blocks over 60 miles", () => {
    const c = snap({ nearestActiveWorkMiles: 61.4, coverageTier: "out_of_range" });
    assert.equal(isP228SendEligible(c), false);
    assert.ok(evaluateP228EligibilityBlockers(c).includes("over_60_miles"));
  });

  it("blocks already sent / signed", () => {
    assert.ok(
      evaluateP228EligibilityBlockers(
        snap({
          workflowStatus: "Paperwork Sent",
          paperworkStatus: "sent",
          signatureRequestId: "sig1",
        }),
      ).includes("already_sent"),
    );
    assert.ok(
      evaluateP228EligibilityBlockers(
        snap({ workflowStatus: "Signed", paperworkStatus: "signed" }),
      ).includes("already_signed"),
    );
  });

  it("blocks missing identity, email, location, DM", () => {
    const blockers = evaluateP228EligibilityBlockers(
      snap({
        name: "Unknown Candidate",
        email: "",
        city: "",
        state: "",
        assignedDM: "Unassigned",
        coverageKnown: false,
        nearestActiveWorkMiles: null,
        coverageTier: "unknown",
      }),
    );
    assert.ok(blockers.includes("missing_identity"));
    assert.ok(blockers.includes("missing_email"));
    assert.ok(blockers.includes("missing_location"));
    assert.ok(blockers.includes("missing_assigned_dm"));
    assert.ok(blockers.includes("coverage_unknown"));
  });
});

describe("P228 inventory and health aggregations", () => {
  it("builds pipeline inventory counts", () => {
    const inv = buildPipelineInventory(
      {
        a: "Applied",
        b: "Paperwork Needed",
        c: "Paperwork Sent",
        d: "Signed",
        e: "Ready for MEL",
        f: "Loaded in MEL",
        g: "Not Qualified",
      },
      10,
    );
    assert.equal(inv.totalCandidates, 10);
    assert.equal(inv.paperworkNeeded, 1);
    assert.equal(inv.paperworkSent, 1);
    assert.equal(inv.signed, 1);
    assert.equal(inv.readyForMel, 1);
    assert.equal(inv.loadedInMel, 1);
    assert.equal(inv.terminal, 2); // Loaded in MEL + Not Qualified
    assert.equal(inv.workflowActive, 4); // PN + PS + Signed + Ready for MEL
  });

  it("aggregates eligibility totals across workflow-active candidates", () => {
    const { totals } = assessEligibility([
      snap({ candidateId: "1", redactedCandidateId: "1" }),
      snap({
        candidateId: "2",
        redactedCandidateId: "2",
        nearestActiveWorkMiles: 80,
        coverageTier: "out_of_range",
      }),
      snap({
        candidateId: "3",
        redactedCandidateId: "3",
        workflowStatus: "Applied",
      }),
    ]);
    assert.equal(totals.workflowActiveEvaluated, 2);
    assert.equal(totals.eligible, 1);
    assert.equal(totals.over_60_miles, 1);
  });

  it("builds recruiter and DM health rows", () => {
    const candidates = [
      snap({ candidateId: "1", assignedRecruiter: "A", assignedDM: "Amy Harp" }),
      snap({
        candidateId: "2",
        assignedRecruiter: "Unassigned",
        assignedDM: "Amy Harp",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "s",
      }),
    ];
    const recruiters = assessRecruiterHealth(candidates);
    assert.ok(recruiters.some((r) => r.recruiter === "A"));
    const dms = assessDmHealth(candidates);
    assert.equal(dms[0]?.districtManager, "Amy Harp");
    assert.equal(dms[0]?.assigned, 2);
  });

  it("flags geographic over-60 and zero-eligible markets", () => {
    const geo = assessGeography([
      snap({ candidateId: "1", state: "OK", nearestActiveWorkMiles: 0 }),
      snap({
        candidateId: "2",
        state: "IL",
        nearestActiveWorkMiles: 100,
        coverageTier: "out_of_range",
      }),
      snap({
        candidateId: "3",
        state: "IL",
        nearestActiveWorkMiles: 90,
        coverageTier: "out_of_range",
      }),
    ]);
    assert.ok(geo.marketsOver60.some((m) => m.state === "IL"));
    assert.ok(geo.zeroEligible.some((z) => z.state === "IL"));
  });
});

describe("P228 dropbox / data quality / risk / scale", () => {
  it("counts dropbox paperwork statuses and controlled send history", () => {
    const d = assessDropboxHealth(
      [
        snap({ paperworkStatus: "sent", signatureRequestId: "a" }),
        snap({ paperworkStatus: "viewed", signatureRequestId: "b" }),
        snap({ paperworkStatus: "signed", signatureRequestId: "c" }),
        snap({ paperworkStatus: "sent", signatureRequestId: "a" }),
      ],
      HISTORICAL,
    );
    assert.equal(d.pending, 2);
    assert.equal(d.viewed, 1);
    assert.equal(d.signed, 1);
    assert.equal(d.duplicatePreventionCount, 1);
    assert.equal(d.recentControlledSends.p227, 3);
    assert.equal(d.recentControlledSends.testMode, true);
  });

  it("scores data quality with orphan and recovery signals", () => {
    const dq = assessDataQuality({
      candidates: [
        snap({ recoveredIdentity: true, recoveredEmail: true, listMembershipSource: "workflow_restored" }),
      ],
      ingestionIds: ["ing-only"],
      workflowIds: ["cand-1", "orphan-wf"],
    });
    assert.equal(dq.recoveredIdentities, 1);
    assert.equal(dq.orphanWorkflow, 2);
    assert.equal(dq.ingestionOnly, 1);
    assert.ok(dq.score >= 0 && dq.score <= 100);
  });

  it("recommends batch 5 after successful P227 testMode with thin eligible pool", () => {
    const risk = assessRisk({
      pipeline: buildPipelineInventory({ a: "Paperwork Sent" }, 1),
      eligibility: {
        eligible: 0,
        evaluated: 2,
        workflowActiveEvaluated: 2,
        missing_identity: 0,
        missing_email: 0,
        missing_phone: 0,
        missing_position: 0,
        missing_location: 0,
        missing_assigned_dm: 0,
        missing_recruiter: 1,
        over_60_miles: 2,
        coverage_unknown: 0,
        archived: 0,
        duplicate: 0,
        already_sent: 0,
        already_signed: 0,
        other: 0,
      },
      dataQuality: {
        recoveredIdentities: 3,
        recoveredEmails: 3,
        recoveredDms: 0,
        workflowRestored: 100,
        ingestionOnly: 0,
        duplicates: 0,
        orphanWorkflow: 200,
        orphanIngestion: 0,
        score: 72,
      },
      dropbox: assessDropboxHealth([], HISTORICAL),
      historical: HISTORICAL,
      unassignedRecruiterPct: 0.4,
      missingDmPct: 0.05,
      coverageUnknownPct: 0.1,
    });
    const scale = recommendScale({
      eligiblePopulation: 0,
      risk,
      historical: HISTORICAL,
      topBlockers: [{ blocker: "over_60_miles", count: 2 }],
    });
    assert.equal(scale.recommendedMaximumBatchSize, 5);
    const go = decideGoNoGo({
      risk,
      scale,
      historical: HISTORICAL,
      eligiblePopulation: 0,
    });
    assert.equal(go.decision, "GO WITH CONDITIONS");
    assert.ok(go.conditions.length > 0);
  });
});

describe("P228 full assessment + report", () => {
  it("builds a complete read-only assessment and markdown", () => {
    const candidates = [
      snap({ candidateId: "elig", redactedCandidateId: "elig00000001" }),
      snap({
        candidateId: "far",
        redactedCandidateId: "far000000002",
        nearestActiveWorkMiles: 102,
        coverageTier: "out_of_range",
        state: "IL",
      }),
      snap({
        candidateId: "sent",
        redactedCandidateId: "sent00000001",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig",
      }),
    ];
    const assessment = buildP228Assessment({
      generatedAt: "2026-07-20T18:00:00.000Z",
      candidates,
      allWorkflowStatuses: {
        elig: "Paperwork Needed",
        far: "Paperwork Needed",
        sent: "Paperwork Sent",
        applied: "Applied",
      },
      ingestionIds: ["elig", "far"],
      workflowIds: ["elig", "far", "sent", "applied"],
      historical: HISTORICAL,
    });
    assert.equal(assessment.phase, P228_PHASE);
    assert.equal(assessment.executionMode, P228_EXECUTION_MODE);
    assert.equal(assessment.safety.candidateWrites, false);
    assert.equal(assessment.safety.dropboxSends, false);
    assert.ok(assessment.eligibility.totals.eligible >= 1);
    assert.ok(assessment.risk.operationalReadinessScore >= 0);
    assert.ok(assessment.risk.operationalReadinessScore <= 100);

    const dash = buildP228OperationalDashboard(assessment, HISTORICAL);
    assert.equal(dash.goDecision, assessment.goNoGo.decision);
    assert.equal(dash.recommendedMaximumBatchSize, assessment.scale.recommendedMaximumBatchSize);

    const md = formatP228MarkdownReport(assessment);
    assert.match(md, /P228/);
    assert.match(md, /Go \/ No-Go/);
    assert.match(md, /Scale Recommendation/);
    assert.match(md, /Candidate writes 0/);
  });

  it("never enables write flags on safety checklist", () => {
    const assessment = buildP228Assessment({
      candidates: [snap()],
      allWorkflowStatuses: { "cand-1": "Paperwork Needed" },
      ingestionIds: ["cand-1"],
      workflowIds: ["cand-1"],
      historical: HISTORICAL,
    });
    assert.deepEqual(assessment.safety, {
      candidateWrites: false,
      dropboxSends: false,
      melWrites: false,
      breezyWrites: false,
      workflowChanges: false,
      commits: false,
    });
  });
});
