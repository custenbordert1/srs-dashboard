import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import {
  isApprovedMappingBridgeActive,
  isApprovedMappingBridgeDryRunEnabled,
  P117_BRIDGE_ENV_FLAG,
} from "@/lib/p117-approved-mapping-runner-integration/bridge-flag";
import { proveProtectionOverridesApproval } from "@/lib/p117-approved-mapping-runner-integration/build-integration-plan-report";
import { classifyPaperworkBlockerWithApprovedBridge } from "@/lib/p117-approved-mapping-runner-integration/classify-with-approved-bridge";
import { buildApprovedMappingOverlayJobs } from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";

function job(partial: Partial<BreezyJob> & { jobId: string; name: string }): BreezyJob {
  return {
    city: "Payson",
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
  candidateId: "c-closed",
  positionId: "closed-pos",
  positionName: "Continuity Store Merchandiser – Payson, AZ",
  city: "Payson",
  state: "AZ",
  email: "valid@example.com",
  hasResume: true,
  workflowStatus: "Paperwork Needed",
  paperworkStatus: "not_sent",
  assignedRecruiter: "Taylor",
} as never;

function approvedMapping(): ApprovedMappingResolution {
  return {
    qualifies: true,
    candidateId: "c-closed",
    closedPositionId: "closed-pos",
    recommendedPositionId: "pub-payson",
    recommendedPositionTitle: "Continuity In-Store Merchandiser Payson, AZ",
    confidenceScore: 84,
    reviewer: "Taylor",
    timestamp: new Date().toISOString(),
    mappingReasons: ["Same city"],
    reason: "P109 approved",
  };
}

describe("p117-approved-mapping-runner-integration", () => {
  it("bridge flag is disabled by default", () => {
    const previous = process.env[P117_BRIDGE_ENV_FLAG];
    delete process.env[P117_BRIDGE_ENV_FLAG];
    assert.equal(isApprovedMappingBridgeDryRunEnabled(), false);
    assert.equal(isApprovedMappingBridgeActive({ engineMode: "dryRun" }), false);
    if (previous !== undefined) process.env[P117_BRIDGE_ENV_FLAG] = previous;
  });

  it("bridge is inactive for executeOne even when flag is set", () => {
    const previous = process.env[P117_BRIDGE_ENV_FLAG];
    process.env[P117_BRIDGE_ENV_FLAG] = "true";
    assert.equal(isApprovedMappingBridgeActive({ engineMode: "executeOne" }), false);
    if (previous !== undefined) process.env[P117_BRIDGE_ENV_FLAG] = previous;
    else delete process.env[P117_BRIDGE_ENV_FLAG];
  });

  it("does not apply bridge when bridgeEnabled is false", () => {
    const closed = job({ jobId: "closed-pos", name: "Closed", status: "closed" });
    const published = job({ jobId: "pub-payson", name: "Continuity In-Store Merchandiser Payson, AZ" });
    const result = classifyPaperworkBlockerWithApprovedBridge({
      row: closedAdRow,
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set(),
      bridgeEnabled: false,
      approvedMapping: approvedMapping(),
    });
    assert.equal(result.bridgeApplied, false);
    assert.equal(result.baselineBlockerCategory, result.blocker.category);
  });

  it("unlocks mapping gate for approved mapping when bridge enabled", () => {
    const closed = job({ jobId: "closed-pos", name: "Closed", status: "closed" });
    const published = job({ jobId: "pub-payson", name: "Continuity In-Store Merchandiser Payson, AZ" });
    const result = classifyPaperworkBlockerWithApprovedBridge({
      row: closedAdRow,
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set(),
      bridgeEnabled: true,
      approvedMapping: approvedMapping(),
    });
    assert.equal(result.bridgeApplied, true);
    assert.equal(result.baselineBlockerCategory, "project_not_mappable");
    assert.notEqual(result.blocker.category, "project_not_mappable");
  });

  it("does not unlock for rejected mapping", () => {
    const closed = job({ jobId: "closed-pos", name: "Closed", status: "closed" });
    const published = job({ jobId: "pub-payson", name: "Continuity In-Store Merchandiser Payson, AZ" });
    const result = classifyPaperworkBlockerWithApprovedBridge({
      row: closedAdRow,
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-pos", closed]]),
      publishedJobs: [published],
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: new Set(),
      bridgeEnabled: true,
      approvedMapping: null,
    });
    assert.equal(result.bridgeApplied, false);
    assert.equal(result.blocker.category, "project_not_mappable");
  });

  it("protection blockers override approved mapping bridge", async () => {
    assert.equal(await proveProtectionOverridesApproval(), true);
  });

  it("builds overlay jobs without mutating baseline job map", () => {
    const published = job({ jobId: "pub-payson", name: "Continuity In-Store Merchandiser Payson, AZ" });
    const jobsByPositionId = new Map<string, BreezyJob>();
    const overlay = buildApprovedMappingOverlayJobs({
      jobsByPositionId,
      closedPositionId: "closed-pos",
      approved: approvedMapping(),
      publishedJobs: [published],
    });
    assert.ok(overlay?.has("closed-pos"));
    assert.equal(jobsByPositionId.has("closed-pos"), false);
  });
});
