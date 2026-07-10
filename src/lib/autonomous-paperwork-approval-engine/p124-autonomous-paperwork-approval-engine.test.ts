import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import {
  evaluateApprovalDecision,
  isAutoApprovedForSendQueue,
} from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
import { buildApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
import { scoreApprovalConfidence } from "@/lib/autonomous-paperwork-approval-engine/score-approval-confidence";
import {
  buildOrchestratorCandidateRecord,
  buildSendQueue,
} from "@/lib/autonomous-paperwork-orchestrator/build-send-queue";
import { evaluateCandidateEligibility } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { evaluateOrchestratorApproval } from "@/lib/autonomous-paperwork-orchestrator/evaluate-approvals";
import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";

const envBackup: Record<string, string | undefined> = {};
let tempDir = "";

function setEnv(key: string, value: string | undefined): void {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function restoreEnv(): Promise<void> {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
}

function baseRow(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: "c1",
    firstName: "Alex",
    lastName: "Pilot",
    email: "alex@example.com",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    assignedRecruiter: "Taylor",
    assignedDM: "Melissa",
    stage: "Applied",
    hasResume: true,
    candidateGrade: { paperworkReady: true },
    paperworkTemplateKey: "onboarding_packet",
    createdDate: new Date().toISOString(),
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function emptyContext(candidateId: string, row: ScoredCandidateWorkflowRow | null): LoadedPaperworkCandidates {
  const publishedJob = {
    jobId: "job-1",
    name: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    displayLocation: "Dallas, TX",
    locationSource: "breezy",
    status: "published",
    createdDate: "",
    updatedDate: "",
  } as const;
  return {
    rowsByCandidateId: row ? new Map([[candidateId, row]]) : new Map(),
    jobsByPositionId: new Map([[publishedJob.jobId, publishedJob]]),
    closedJobsByPositionId: new Map(),
    publishedJobs: [publishedJob],
    publishedJobTitleById: new Map([[publishedJob.jobId, publishedJob.name]]),
    onboardingByCandidateId: new Map(),
    p109ByCandidate: new Map(),
    approvedMappingsByCandidate: new Map(),
    p100SentIds: new Set(),
    pilotSentIds: new Set(),
    candidateIds: [candidateId],
  };
}

function decisionInput(overrides: {
  row?: ScoredCandidateWorkflowRow | null;
  eligibilityStatus?: import("@/lib/autonomous-paperwork-orchestrator/types").PaperworkEligibilityStatus;
  templateKey?: string | null;
  mappingConfidence?: number;
  approvedMapping?: ApprovedMappingResolution | null;
  nativePublishedJob?: boolean;
  alreadySent?: boolean;
  duplicateRisk?: boolean;
}) {
  const row = overrides.row ?? baseRow();
  const policy = buildApprovalPolicy();
  return {
    candidateId: row.candidateId,
    candidateName: "Alex Pilot",
    row,
    eligibilityStatus: overrides.eligibilityStatus ?? "READY_TO_SEND",
    templateKey: overrides.templateKey ?? "onboarding_packet",
    mappingConfidence: overrides.mappingConfidence ?? 90,
    approvedMapping: overrides.approvedMapping ?? null,
    p109Record: null,
    nativePublishedJob: overrides.nativePublishedJob ?? true,
    alreadySent: overrides.alreadySent ?? false,
    duplicateRisk: overrides.duplicateRisk ?? false,
    candidateAgeDays: 2,
    policy,
  };
}

describe("autonomous-paperwork-approval-engine (P124)", () => {
  afterEach(async () => {
    await restoreEnv();
  });

  it("already_sent always rejects for safety", () => {
    const result = evaluateApprovalDecision(
      decisionInput({ eligibilityStatus: "ALREADY_SENT", alreadySent: true }),
    );
    assert.equal(result.approvalDecision, "REJECTED_FOR_SAFETY");
    assert.ok(result.safetyReasons.some((r) => /already sent/i.test(r)));
  });

  it("duplicate_risk always rejects for safety", () => {
    const result = evaluateApprovalDecision(
      decisionInput({ eligibilityStatus: "DUPLICATE", duplicateRisk: true }),
    );
    assert.equal(result.approvalDecision, "REJECTED_FOR_SAFETY");
    assert.ok(result.safetyReasons.some((r) => /duplicate/i.test(r)));
  });

  it("invalid_email always rejects for safety", () => {
    const result = evaluateApprovalDecision(
      decisionInput({
        row: baseRow({ email: "not-an-email" }),
        eligibilityStatus: "INVALID_EMAIL",
      }),
    );
    assert.equal(result.approvalDecision, "REJECTED_FOR_SAFETY");
    assert.ok(result.safetyReasons.some((r) => /invalid email/i.test(r)));
  });

  it("missing template rejects for safety", () => {
    const result = evaluateApprovalDecision(
      decisionInput({ templateKey: null, eligibilityStatus: "NO_TEMPLATE" }),
    );
    assert.equal(result.approvalDecision, "REJECTED_FOR_SAFETY");
    assert.ok(result.safetyReasons.some((r) => /missing template/i.test(r)));
  });

  it("approved mapping contributes to approval score", () => {
    const approvedMapping: ApprovedMappingResolution = {
      qualifies: true,
      candidateId: "c1",
      closedPositionId: "closed-1",
      recommendedPositionId: "job-2",
      recommendedPositionTitle: "Field Rep",
      confidenceScore: 95,
      reviewer: "Taylor",
      timestamp: new Date().toISOString(),
      mappingReasons: ["test"],
      reason: "test",
    };
    const scoring = scoreApprovalConfidence({
      row: baseRow({ positionId: "closed-1" }),
      templateKey: "onboarding_packet",
      mappingConfidence: 90,
      approvedMapping,
      p109Record: null,
      nativePublishedJob: false,
      alreadySent: false,
      duplicateRisk: false,
      candidateAgeDays: 2,
      policy: buildApprovalPolicy(),
    });
    assert.ok(scoring.approvalReasons.includes("Approved mapping"));
    assert.ok(scoring.score >= 70);
  });

  it("native active project contributes to approval score", () => {
    const scoring = scoreApprovalConfidence({
      row: baseRow(),
      templateKey: "onboarding_packet",
      mappingConfidence: 90,
      approvedMapping: null,
      p109Record: null,
      nativePublishedJob: true,
      alreadySent: false,
      duplicateRisk: false,
      candidateAgeDays: 2,
      policy: buildApprovalPolicy(),
    });
    assert.ok(scoring.approvalReasons.includes("Published active job"));
    assert.ok(scoring.approvalReasons.includes("Native active project match"));
    assert.ok(scoring.score >= 70);
  });

  it("AUTO_APPROVED requires score threshold and safety pass", () => {
    const ready = evaluateApprovalDecision(decisionInput({ mappingConfidence: 90 }));
    assert.equal(ready.approvalDecision, "AUTO_APPROVED");
    assert.ok(ready.approvalScore >= buildApprovalPolicy().autoApproveThreshold);
    assert.equal(isAutoApprovedForSendQueue(ready.approvalDecision), true);
  });

  it("NEEDS_HUMAN_APPROVAL does not enter send queue", () => {
    const human = evaluateApprovalDecision(
      decisionInput({ mappingConfidence: 75, nativePublishedJob: true }),
    );
    assert.equal(human.approvalDecision, "NEEDS_HUMAN_APPROVAL");

    const candidate = buildOrchestratorCandidateRecord({
      candidateId: "c1",
      candidateName: "Alex",
      email: "alex@example.com",
      positionId: "job-1",
      positionTitle: "Merch",
      recruiter: "Taylor",
      dm: "Melissa",
      eligibilityStatus: "READY_TO_SEND",
      requiredAction: "Review",
      blockingReasons: [],
      templateKey: "onboarding_packet",
      mappingConfidence: 75,
      approvedMappingReady: false,
      onPilotAllowlist: true,
      approvedForQueue: false,
      approvalDecision: human.approvalDecision,
      approvalScore: human.approvalScore,
    });
    const queue = buildSendQueue([candidate]);
    assert.equal(queue.queueDepth, 0);
  });

  it("BLOCKED does not enter send queue", () => {
    const blocked = evaluateApprovalDecision(
      decisionInput({
        nativePublishedJob: false,
        mappingConfidence: 0,
        row: baseRow({
          assignedRecruiter: "Unassigned",
          assignedDM: "",
          hasResume: false,
          candidateGrade: { paperworkReady: false },
        }),
      }),
    );
    assert.equal(blocked.approvalDecision, "BLOCKED");

    const candidate = buildOrchestratorCandidateRecord({
      candidateId: "c1",
      candidateName: "Alex",
      email: "alex@example.com",
      positionId: null,
      positionTitle: null,
      recruiter: null,
      dm: null,
      eligibilityStatus: "NO_PROJECT",
      requiredAction: "Fix mapping",
      blockingReasons: blocked.blockingReasons,
      templateKey: "onboarding_packet",
      mappingConfidence: 20,
      approvedMappingReady: false,
      onPilotAllowlist: true,
      approvedForQueue: false,
      approvalDecision: blocked.approvalDecision,
      approvalScore: blocked.approvalScore,
    });
    const queue = buildSendQueue([candidate]);
    assert.equal(queue.queueDepth, 0);
  });

  it("P123 queue only includes AUTO_APPROVED candidates on allowlist", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p124-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST", "c1,c2");

    const row1 = baseRow({ candidateId: "c1" });
    const row2 = baseRow({ candidateId: "c2", email: "bad-email", firstName: "Bob", lastName: "Blocked" });
    const context: LoadedPaperworkCandidates = {
      ...emptyContext("c1", row1),
      rowsByCandidateId: new Map([
        ["c1", row1],
        ["c2", row2],
      ]),
      candidateIds: ["c1", "c2"],
    };

    const result = await runPaperworkCycle({ dryRun: true, contextOverride: context });
    for (const queued of result.report.sendQueue.remainingQueue) {
      assert.equal(queued.approvalDecision, "AUTO_APPROVED");
      assert.equal(queued.onPilotAllowlist, true);
    }
    const invalid = result.report.candidates.find((c) => c.candidateId === "c2");
    assert.notEqual(invalid?.approvalDecision, "AUTO_APPROVED");
  });

  it("P122 gates still required before any live send", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p124-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);
    setEnv("AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST", "c1");
    setEnv("AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED", "false");

    let executeOneCalls = 0;
    const row = baseRow();
    const result = await runPaperworkCycle({
      execute: true,
      confirmationPhrase: P122_CONFIRMATION_PHRASE,
      candidateId: "c1",
      contextOverride: emptyContext("c1", row),
      runPilotSend: (async () => {
        executeOneCalls += 1;
        return {
          report: {} as never,
          sendPacketPreview: null,
          sendResult: {
            executedAt: new Date().toISOString(),
            candidateId: "c1",
            candidateName: "Alex Pilot",
            outcome: "sent",
            signatureRequestId: "sig-1",
            error: null,
            mode: "executeOne",
          },
          executedMode: "executeOne",
          executeBatchCalled: false,
        };
      }) as never,
    });

    assert.equal(executeOneCalls, 0);
    assert.equal(result.report.execution.executed, false);
    assert.equal(result.report.safetyState.goNoGo, "NO-GO");
  });

  it("executeBatch is never used in P123 cycle", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "p124-test-"));
    setEnv("SRS_RECRUITING_DATA_DIR", tempDir);

    const result = await runPaperworkCycle({ dryRun: true });
    assert.equal(result.executeBatchCalled, false);
    assert.equal(result.report.execution.executeBatchCalled, false);
  });

  it("orchestrator approval requires AUTO_APPROVED and pilot allowlist", () => {
    const row = baseRow();
    const context = emptyContext("c1", row);
    const eligibility = evaluateCandidateEligibility({
      candidateId: "c1",
      row,
      context,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      approvedMapping: null,
    });

    const offAllowlist = evaluateOrchestratorApproval({
      context,
      candidateId: "c1",
      candidateName: "Alex Pilot",
      eligibilityStatus: eligibility.status,
      templateKey: eligibility.templateKey,
      mappingConfidence: eligibility.mappingConfidence,
      approvedMappingReady: eligibility.approvedMappingReady,
      onPilotAllowlist: false,
      row,
    });
    assert.equal(offAllowlist.approvedForQueue, false);

    const onAllowlist = evaluateOrchestratorApproval({
      context,
      candidateId: "c1",
      candidateName: "Alex Pilot",
      eligibilityStatus: eligibility.status,
      templateKey: eligibility.templateKey,
      mappingConfidence: eligibility.mappingConfidence,
      approvedMappingReady: eligibility.approvedMappingReady,
      onPilotAllowlist: true,
      row,
    });
    if (onAllowlist.approval.approvalDecision === "AUTO_APPROVED") {
      assert.equal(onAllowlist.approvedForQueue, true);
    }
  });
});
