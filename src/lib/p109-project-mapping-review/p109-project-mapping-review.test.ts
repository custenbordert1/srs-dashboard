import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import {
  isClosedAdMappingBlocker,
  resolveClosedAdProjectMapping,
} from "@/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping";
import {
  mapRunnerModeToEngineMode,
  P106_1_DEFAULT_MODE,
} from "@/lib/autonomous-paperwork-runner";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import {
  buildApprovalBridgeIndex,
  isIdentifiedAsApproved,
  isRejectedMapping,
  isSkippedOrPending,
  isTrustedLocalApproval,
  protectionBlockerOverridesApproval,
  resolveMappingApprovalStatus,
  unapprovedReviewBlocksRunnerTrust,
} from "@/lib/p109-project-mapping-review/approval-bridge";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";

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
  candidateId: "c-review",
  positionId: "closed-pos",
  positionName: "Solar Installer",
  city: "Phoenix",
  state: "AZ",
  email: "valid@example.com",
  hasResume: true,
  workflowStatus: "Paperwork Needed",
  paperworkStatus: "not_sent",
} as never;

describe("p109-project-mapping-review", () => {
  it("classifies approval bridge statuses", () => {
    assert.equal(
      resolveMappingApprovalStatus({ candidateId: "c1", mappingDecision: "REVIEW" }),
      "pending",
    );
    assert.equal(
      resolveMappingApprovalStatus({ candidateId: "c1", mappingDecision: "AUTO_MAP" }),
      "approved",
    );
    const record: P109ReviewDecisionRecord = {
      candidateId: "c1",
      candidateName: "Alex",
      closedPositionId: "closed",
      recommendedPositionId: "pub",
      decision: "approved",
      reviewer: "taylor",
      notes: "",
      timestamp: new Date().toISOString(),
      confidenceScore: 80,
      mappingReasons: [],
      mappingDecision: "REVIEW",
      factorScores: [],
    };
    assert.equal(
      resolveMappingApprovalStatus({ candidateId: "c1", mappingDecision: "REVIEW", record }),
      "approved",
    );
  });

  it("blocks unapproved REVIEW candidates from runner trust", () => {
    assert.equal(
      unapprovedReviewBlocksRunnerTrust({
        mappingDecision: "REVIEW",
        approvalStatus: "pending",
      }),
      true,
    );
    assert.equal(
      unapprovedReviewBlocksRunnerTrust({
        mappingDecision: "REVIEW",
        approvalStatus: "approved",
      }),
      false,
    );
    assert.equal(
      unapprovedReviewBlocksRunnerTrust({
        mappingDecision: "AUTO_MAP",
        approvalStatus: "pending",
      }),
      false,
    );
  });

  it("identifies approved mappings via bridge without auto-send", () => {
    assert.equal(isIdentifiedAsApproved("approved"), true);
    assert.equal(isIdentifiedAsApproved("pending"), false);
    assert.equal(
      isTrustedLocalApproval({ mappingDecision: "REVIEW", approvalStatus: "approved" }),
      true,
    );
    assert.equal(
      isTrustedLocalApproval({ mappingDecision: "REVIEW", approvalStatus: "pending" }),
      false,
    );
  });

  it("keeps rejected and skipped mappings out of approved set", () => {
    assert.equal(isRejectedMapping("rejected"), true);
    assert.equal(isSkippedOrPending("skipped"), true);
    assert.equal(isSkippedOrPending("pending"), true);

    const bridge = buildApprovalBridgeIndex({
      recommendations: [
        { candidateId: "a", mappingDecision: "REVIEW" },
        { candidateId: "b", mappingDecision: "REVIEW" },
        { candidateId: "c", mappingDecision: "REVIEW" },
      ],
      records: [
        {
          candidateId: "a",
          candidateName: "A",
          closedPositionId: "x",
          recommendedPositionId: "y",
          decision: "approved",
          reviewer: "r",
          notes: "",
          timestamp: new Date().toISOString(),
          confidenceScore: 80,
          mappingReasons: [],
          mappingDecision: "REVIEW",
          factorScores: [],
        },
        {
          candidateId: "b",
          candidateName: "B",
          closedPositionId: "x",
          recommendedPositionId: "y",
          decision: "rejected",
          reviewer: "r",
          notes: "",
          timestamp: new Date().toISOString(),
          confidenceScore: 60,
          mappingReasons: [],
          mappingDecision: "REVIEW",
          factorScores: [],
        },
        {
          candidateId: "c",
          candidateName: "C",
          closedPositionId: "x",
          recommendedPositionId: "y",
          decision: "skipped",
          reviewer: "r",
          notes: "",
          timestamp: new Date().toISOString(),
          confidenceScore: 55,
          mappingReasons: [],
          mappingDecision: "REVIEW",
          factorScores: [],
        },
      ],
    });

    assert.deepEqual(bridge.approved, ["a"]);
    assert.deepEqual(bridge.rejected, ["b"]);
    assert.deepEqual(bridge.skipped, ["c"]);
    assert.deepEqual(bridge.pending, []);
  });

  it("preserves P106.3 closed-ad mapping behavior for medium-confidence matches", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed" });
    const published = job({ jobId: "pub-1", name: "Solar Installer", city: "Dallas", state: "TX" });
    const result = resolveClosedAdProjectMapping({
      row: closedAdRow,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
    });
    assert.equal(result.status, "project_mapping_review");
    assert.equal(isClosedAdMappingBlocker(result.status), true);
  });

  it("keeps P106.3 runner default mode dryRun", () => {
    assert.equal(P106_1_DEFAULT_MODE, "dryRun");
    assert.equal(mapRunnerModeToEngineMode({ mode: "runOnce", liveEngineMode: "executeOne" }), "executeOne");
    assert.equal(mapRunnerModeToEngineMode({ mode: "dryRun", liveEngineMode: "executeOne" }), "dryRun");
  });

  it("protection blockers win over mapping approval", () => {
    assert.equal(protectionBlockerOverridesApproval("already_sent"), true);
    assert.equal(protectionBlockerOverridesApproval("invalid_email"), true);
    assert.equal(protectionBlockerOverridesApproval("duplicate_risk"), true);
    assert.equal(protectionBlockerOverridesApproval("project_mapping_review"), false);
  });

  it("classifyPaperworkBlocker blocks before mapping for invalid email", () => {
    const blocker = classifyPaperworkBlocker({
      row: { ...closedAdRow, email: "not-an-email" },
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map(),
      publishedJobs: [],
      paperworkByGrade: {},
      p100SentIds: new Set(),
    });
    assert.equal(blocker.category, "invalid_email");
  });

  it("classifyPaperworkBlocker blocks already_sent before mapping review", () => {
    const blocker = classifyPaperworkBlocker({
      row: {
        ...closedAdRow,
        paperworkStatus: "sent",
        workflowStatus: "Paperwork Sent",
        signatureRequestId: "sig-1",
      },
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", job({ jobId: "closed-pos", name: "Solar Installer", status: "closed" })]]),
      publishedJobs: [job({ jobId: "pub-1", name: "Solar Installer" })],
      paperworkByGrade: {},
      p100SentIds: new Set(["c-review"]),
    });
    assert.equal(blocker.category, "already_sent");
  });

  it("unapproved REVIEW still blocked by P106.3 project_mapping_review gate", () => {
    const closed = job({ jobId: "closed-pos", name: "Solar Installer", status: "closed", city: "Phoenix", state: "AZ" });
    const published = job({ jobId: "pub-1", name: "Solar Installer", city: "Dallas", state: "TX" });
    const mapping = resolveClosedAdProjectMapping({
      row: closedAdRow,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
    });
    assert.equal(mapping.status, "project_mapping_review");

    const approvalStatus = resolveMappingApprovalStatus({
      candidateId: "c-review",
      mappingDecision: "REVIEW",
    });
    assert.equal(unapprovedReviewBlocksRunnerTrust({ mappingDecision: "REVIEW", approvalStatus }), true);

    const blocker = classifyPaperworkBlocker({
      row: closedAdRow,
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: { A: [], B: [], C: [] },
      p100SentIds: new Set(),
    });
    assert.equal(blocker.category, "project_mapping_review");
  });
});
