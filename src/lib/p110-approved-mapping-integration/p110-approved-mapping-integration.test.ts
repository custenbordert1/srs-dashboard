import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import {
  mapRunnerModeToEngineMode,
  P106_1_DEFAULT_MODE,
} from "@/lib/autonomous-paperwork-runner";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { protectionBlockerOverridesApproval } from "@/lib/p109-project-mapping-review/approval-bridge";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import {
  listQualifiedApprovedMappings,
  resolveApprovedMapping,
} from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import {
  buildApprovedMappingOverlayJobs,
  isNewlyEligibleViaApproval,
  simulateCandidateDryRunEligibility,
} from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";

function job(partial: Partial<BreezyJob> & { jobId: string; name: string }): BreezyJob {
  return {
    city: "Phoenix",
    state: "AZ",
    status: "published",
    zip: "",
    displayLocation: "",
    locationSource: "location",
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    ...partial,
  } as BreezyJob;
}

const closedAdRow = {
  candidateId: "c-approved",
  positionId: "closed-pos",
  positionName: "Solar Installer",
  city: "Phoenix",
  state: "AZ",
  email: "valid@example.com",
  hasResume: true,
  workflowStatus: "Paperwork Needed",
  paperworkStatus: "not_sent",
  assignedRecruiter: "Taylor",
} as never;

function approvedRecord(overrides?: Partial<P109ReviewDecisionRecord>): P109ReviewDecisionRecord {
  return {
    candidateId: "c-approved",
    candidateName: "Alex Rivera",
    closedPositionId: "closed-pos",
    recommendedPositionId: "pub-1",
    decision: "approved",
    reviewer: "taylor",
    notes: "Looks correct",
    timestamp: new Date().toISOString(),
    confidenceScore: 84,
    mappingReasons: ["Similar title"],
    mappingDecision: "REVIEW",
    factorScores: [],
    ...overrides,
  };
}

describe("p110-approved-mapping-integration", () => {
  it("resolves only approved P109 mappings with required fields", () => {
    assert.equal(resolveApprovedMapping({ record: null, candidateId: "c1" }), null);
    assert.equal(
      resolveApprovedMapping({
        record: approvedRecord({ decision: "rejected" }),
        candidateId: "c-approved",
      }),
      null,
    );
    assert.equal(
      resolveApprovedMapping({
        record: approvedRecord({ decision: "skipped" }),
        candidateId: "c-approved",
      }),
      null,
    );
    const resolved = resolveApprovedMapping({
      record: approvedRecord(),
      candidateId: "c-approved",
      closedPositionId: "closed-pos",
      publishedJobTitleById: new Map([["pub-1", "Solar Installer"]]),
    });
    assert.ok(resolved?.qualifies);
    assert.equal(resolved?.recommendedPositionId, "pub-1");
    assert.equal(resolved?.reviewer, "taylor");
  });

  it("lists only qualified approved mappings", () => {
    const list = listQualifiedApprovedMappings([
      approvedRecord(),
      approvedRecord({ candidateId: "c2", decision: "rejected" }),
      approvedRecord({ candidateId: "c3", decision: "skipped", recommendedPositionId: "pub-1" }),
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.candidateId, "c-approved");
  });

  it("unlocks eligibility in dryRun when mapping is approved", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed" });
    const published = job({ jobId: "pub-1", name: "Solar Installer", city: "Dallas", state: "TX" });
    const jobsByPositionId = new Map<string, BreezyJob>();
    const closedJobs = new Map([["closed-pos", closed]]);

    const approved = resolveApprovedMapping({
      record: approvedRecord(),
      candidateId: "c-approved",
      closedPositionId: "closed-pos",
    })!;

    const result = simulateCandidateDryRunEligibility({
      row: closedAdRow,
      onboarding: null,
      jobsByPositionId,
      closedJobsByPositionId: closedJobs,
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set(),
      approvedMapping: approved,
    });

    assert.equal(result.baselineBlocker, "project_mapping_review");
    assert.equal(result.overlayBlocker, "p84_gate_failed");
    assert.equal(result.outcome, "newly_eligible_via_approval");
    assert.equal(isNewlyEligibleViaApproval(result.outcome), true);
  });

  it("does not unlock eligibility for pending mappings", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed" });
    const published = job({ jobId: "pub-1", name: "Solar Installer", city: "Dallas", state: "TX" });
    const result = simulateCandidateDryRunEligibility({
      row: closedAdRow,
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set(),
      approvedMapping: null,
    });
    assert.equal(result.outcome, "needs_recruiter_review");
    assert.equal(result.overlayBlocker, null);
  });

  it("does not unlock eligibility for rejected or skipped mappings", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed" });
    const published = job({ jobId: "pub-1", name: "Solar Installer", city: "Dallas", state: "TX" });
    const baseInput = {
      row: closedAdRow,
      onboarding: null,
      jobsByPositionId: new Map<string, BreezyJob>(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set<string>(),
    };

    for (const decision of ["rejected", "skipped"] as const) {
      const mapping = resolveApprovedMapping({
        record: approvedRecord({ decision }),
        candidateId: "c-approved",
      });
      assert.equal(mapping, null);
      const result = simulateCandidateDryRunEligibility({
        ...baseInput,
        approvedMapping: mapping,
      });
      assert.notEqual(result.outcome, "newly_eligible_via_approval");
    }
  });

  it("protection blockers override approved mappings", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed" });
    const published = job({ jobId: "pub-1", name: "Solar Installer" });
    const approved = resolveApprovedMapping({
      record: approvedRecord(),
      candidateId: "c-approved",
      closedPositionId: "closed-pos",
    })!;

    const alreadySent = simulateCandidateDryRunEligibility({
      row: {
        ...closedAdRow,
        paperworkStatus: "sent",
        workflowStatus: "Paperwork Sent",
        signatureRequestId: "sig-1",
      },
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set(["c-approved"]),
      approvedMapping: approved,
    });
    assert.equal(alreadySent.outcome, "excluded_already_sent");
    assert.ok(protectionBlockerOverridesApproval("already_sent"));

    const invalidEmail = simulateCandidateDryRunEligibility({
      row: { ...closedAdRow, email: "bad-email" },
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set(),
      approvedMapping: approved,
    });
    assert.equal(invalidEmail.outcome, "excluded_invalid_email");
  });

  it("builds overlay jobs without mutating published job map", () => {
    const published = job({ jobId: "pub-1", name: "Solar Installer" });
    const jobsByPositionId = new Map<string, BreezyJob>();
    const approved = resolveApprovedMapping({
      record: approvedRecord(),
      candidateId: "c-approved",
      closedPositionId: "closed-pos",
    })!;
    const overlay = buildApprovedMappingOverlayJobs({
      jobsByPositionId,
      closedPositionId: "closed-pos",
      approved,
      publishedJobs: [published],
    });
    assert.ok(overlay?.has("closed-pos"));
    assert.equal(jobsByPositionId.has("closed-pos"), false);
    assert.equal(overlay?.get("closed-pos")?.jobId, "pub-1");
  });

  it("preserves P106.3 runner default behavior unless integration is invoked", () => {
    assert.equal(P106_1_DEFAULT_MODE, "dryRun");
    assert.equal(mapRunnerModeToEngineMode({ mode: "dryRun", liveEngineMode: "executeOne" }), "dryRun");
    assert.equal(mapRunnerModeToEngineMode({ mode: "runOnce", liveEngineMode: "executeOne" }), "executeOne");
    assert.equal(
      typeof buildApprovedMappingOverlayJobs,
      "function",
    );
  });
});
