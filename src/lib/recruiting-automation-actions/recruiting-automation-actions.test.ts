import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, it, beforeEach, afterEach } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { DISTRICT_MANAGERS } from "@/lib/dm-territory-map";
import {
  approveAutomation,
  buildAutomationControlCenterSnapshot,
  buildAutomationDuplicateKey,
  buildAutomationRecord,
  buildCampaignDraftFromOpportunity,
  buildJobRefreshDraftFromRecommendation,
  buildPostingDraftFromTerritory,
  buildQueueAgingBuckets,
  canExecuteAutomation,
  executeAutomation,
  executeBreezyJobRefreshAdapter,
  generateDraftsFromIntelligence,
  getMessageTemplate,
  listAutomationRecords,
  markAutomationCompleted,
  mergeDuplicateAutomations,
  previewAutomation,
  readAutomationStore,
  renderMessageTemplate,
  submitAutomationForApproval,
  upsertAutomationRecord,
  writeAutomationStore,
} from "@/lib/recruiting-automation-actions";
import { listRecommendationRecords } from "@/lib/recommendation-intelligence/store";

const SAMPLE_DM = DISTRICT_MANAGERS[0]!;

const session: AuthSession = {
  userId: "user-test-1",
  email: "exec@test.com",
  name: "Test Executive",
  role: "executive",
  territoryStates: null,
};

let originalCwd: string;
let tempDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(path.join(tmpdir(), "automation-actions-"));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true, force: true });
});

function sampleRecommendation(overrides: Partial<AutopilotRecommendation> = {}): AutopilotRecommendation {
  return {
    id: "autopilot:job:job-1",
    kind: "refresh-job-posting",
    title: "Refresh Job Posting",
    entityType: "job-posting",
    entityId: "job-1",
    entityLabel: "Retail Merchandiser · Austin, TX",
    dmName: SAMPLE_DM,
    impactScore: 72,
    confidenceScore: 68,
    estimatedOutcomeImprovement: 65,
    reasoning: "Stale posting with low applicant velocity.",
    supportingMetrics: [],
    opportunity: {
      currentRisk: 70,
      potentialImprovement: 18,
      estimatedCandidateGain: 6,
      estimatedCoverageGain: 9,
      estimatedCompletionGain: 4,
      expectedRoiScore: 66,
    },
    prioritizationScore: 74,
    horizon: "quick-win",
    navigation: { tabId: "autopilot-recommendations", label: "Open Autopilot" },
    ...overrides,
  };
}

function minimalBundle(): RecruitingIntelligenceRouteBundle {
  return {
    jobs: [
      {
        jobId: "job-1",
        name: "Retail Merchandiser",
        city: "Austin",
        state: "TX",
        zip: "78701",
        displayLocation: "Austin, TX",
        locationSource: "location",
        status: "published",
        createdDate: "2026-05-01T00:00:00.000Z",
        updatedDate: "2026-06-01T00:00:00.000Z",
        candidateCount: 3,
      },
    ],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z", state: "published", companyId: "cache" },
    candidates: [],
    workflows: {},
    opportunities: [],
    activeReps: [],
    coverage: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      territoryStates: null,
      opportunities: [],
      executiveSummary: {
        totalOpenOpportunities: 0,
        highRiskProjectCount: 0,
        yellowRiskProjectCount: 0,
        zeroNearbyRepProjects: 0,
        averageCoverageScore: 55,
        lowDensityStates: [],
        highOpportunityLowRepMarkets: [],
      },
      dmAlerts: {
        highRiskProjects: [],
        noNearbyReps: [],
        recruitingUrgency: [],
        bestAvailableReps: [],
      },
    },
    fetchedAt: "2026-06-15T12:00:00.000Z",
    candidatesResult: {
      ok: true,
      candidates: [],
      fetchedAt: "2026-06-15T12:00:00.000Z",
      companyId: "cache",
      scanMode: "fast",
      positionsScanned: 0,
      totalPositionsAvailable: 0,
      partial: true,
      hydrationComplete: false,
      source: "recruiting-intelligence-cache",
    },
    melOk: false,
    intelligenceCache: {
      fetchedAt: "2026-06-15T12:00:00.000Z",
      source: "cache",
      partial: false,
    },
  };
}

describe("recruiting-automation-actions", () => {
  it("creates job refresh draft from autopilot recommendation", () => {
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    assert.equal(draft.actionType, "job-refresh");
    assert.equal(draft.approvalStatus, "Draft");
    assert.equal(draft.payload && "expectedApplicantGain" in draft.payload ? draft.payload.expectedApplicantGain : 0, 6);
    assert.equal(draft.sourceRecommendation?.recommendationId, "autopilot:job:job-1");
  });

  it("creates posting draft for territory coverage gap", () => {
    const draft = buildPostingDraftFromTerritory({
      territory: "Texas",
      state: "TX",
      city: "Austin",
      openCalls: 12,
      activeJobs: 1,
      coveragePercent: 45,
    });
    assert.equal(draft.actionType, "create-posting");
    assert.ok("city" in draft.payload && draft.payload.city === "Austin");
    assert.equal(draft.approvalStatus, "Draft");
  });

  it("creates campaign draft with rendered message template", () => {
    const draft = buildCampaignDraftFromOpportunity({
      candidateId: "cand-1",
      candidateName: "Alex Rivera",
      city: "Austin",
      state: "TX",
      source: "stalled",
      owner: "Recruiter A",
      reason: "Stalled in pipeline",
      expectedPlacements: 2,
      expectedCoverageGain: 5,
      recommendationId: "recovery:cand-1",
    });
    assert.equal(draft.actionType, "follow-up-campaign");
    assert.ok("message" in draft.payload && draft.payload.message.includes("Alex"));
    const template = getMessageTemplate("stalled-candidate");
    const rendered = renderMessageTemplate(template.body, {
      firstName: "Alex",
      recruiterName: "Recruiter A",
      city: "Austin",
    });
    assert.ok(rendered.includes("Austin"));
  });

  it("runs approval workflow draft → pending → approved", async () => {
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    await upsertAutomationRecord(draft);

    const submitted = await submitAutomationForApproval(session, draft.id);
    assert.equal(submitted.ok, true);
    assert.equal(submitted.record?.approvalStatus, "Pending Approval");
    assert.ok(submitted.record!.auditLog.some((row) => row.action === "submitted"));

    const approved = await approveAutomation(session, draft.id);
    assert.equal(approved.ok, true);
    assert.equal(approved.record?.approvalStatus, "Approved");
    assert.ok(approved.record?.approvedBy);
    assert.ok(approved.record?.approvedAt);
    assert.ok(approved.record!.auditLog.some((row) => row.action === "approved"));
  });

  it("updates P38 recommendation status on approve", async () => {
    const recId = "automation-approve-p38";
    const draft = buildAutomationRecord({
      actionType: "job-refresh",
      owner: SAMPLE_DM,
      reason: "Approve P38 test",
      expectedImpact: "+5 applicants",
      payload: {
        title: "Test Job",
        location: "Austin, TX",
        project: null,
        reason: "Test",
        expectedApplicantGain: 5,
        priority: "high",
        timing: "Today",
      },
      sourceRecommendation: {
        recommendationId: recId,
        recommendationType: "refresh-job-posting",
        source: "autopilot",
        label: "Refresh",
      },
    });
    await upsertAutomationRecord(draft);
    await submitAutomationForApproval(session, draft.id);
    await approveAutomation(session, draft.id);

    const records = await listRecommendationRecords();
    const tracked = records.find((row) => row.recommendationId === recId);
    assert.ok(tracked);
    assert.equal(tracked?.status, "In Progress");
  });

  it("blocks unapproved execution via safety rules", async () => {
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    await upsertAutomationRecord(draft);

    const check = canExecuteAutomation(draft, "requires-approval");
    assert.equal(check.allowed, false);
    assert.ok(check.reason?.includes("Approval required"));

    const result = await executeAutomation(session, draft.id);
    assert.equal(result.ok, false);
    assert.ok(result.error?.includes("Approval required"));
  });

  it("adapter simulates Breezy refresh without live calls", async () => {
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    const adapter = await executeBreezyJobRefreshAdapter(draft);
    assert.equal(adapter.ok, true);
    assert.equal(adapter.manualExecutionRequired, false);
    assert.ok(adapter.message.includes("Simulated execution"));

    const preview = await executeBreezyJobRefreshAdapter(draft, { previewOnly: true });
    assert.equal(preview.ok, false);
    assert.ok(preview.message.includes("Preview"));
  });

  it("logs audit entries on preview and simulated execution", async () => {
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    await upsertAutomationRecord(draft);
    await submitAutomationForApproval(session, draft.id);
    await approveAutomation(session, draft.id);

    const preview = await previewAutomation(session, draft.id);
    assert.equal(preview.ok, true);
    assert.ok(preview.record!.auditLog.some((row) => row.action === "preview"));

    const executed = await executeAutomation(session, draft.id);
    assert.equal(executed.ok, true);
    assert.ok(executed.adapterMessage?.includes("Simulated execution"));
    assert.equal(executed.record?.approvalStatus, "Completed");
    assert.ok(executed.record!.auditLog.some((row) => row.action === "executed"));
    assert.ok(executed.record!.auditLog.some((row) => row.action === "completed"));
  });

  it("integrates with P38 on manual completion", async () => {
    const recId = "automation-p38-test";
    const draft = buildAutomationRecord({
      actionType: "job-refresh",
      owner: SAMPLE_DM,
      reason: "Test P38 integration",
      expectedImpact: "+5 applicants",
      payload: {
        title: "Test Job",
        location: "Austin, TX",
        project: null,
        reason: "Test",
        expectedApplicantGain: 5,
        priority: "high",
        timing: "Today",
      },
      sourceRecommendation: {
        recommendationId: recId,
        recommendationType: "refresh-job-posting",
        source: "autopilot",
        label: "Refresh",
      },
    });
    await upsertAutomationRecord(draft);
    await submitAutomationForApproval(session, draft.id);
    await approveAutomation(session, draft.id);

    const completed = await markAutomationCompleted(session, draft.id);
    assert.equal(completed.ok, true);
    assert.equal(completed.record?.approvalStatus, "Completed");

    const records = await listRecommendationRecords();
    const tracked = records.find((row) => row.recommendationId === recId);
    assert.ok(tracked);
    assert.equal(tracked?.status, "Executed");
  });

  it("starts P38 ROI tracking when execution completes", async () => {
    const recId = "automation-execute-p38";
    const draft = buildAutomationRecord({
      actionType: "job-refresh",
      owner: SAMPLE_DM,
      reason: "Execute P38 test",
      expectedImpact: "+8 applicants",
      payload: {
        title: "Execute Job",
        location: "Dallas, TX",
        project: null,
        reason: "Test",
        expectedApplicantGain: 8,
        priority: "high",
        timing: "Today",
        jobId: "job-execute",
      },
      sourceRecommendation: {
        recommendationId: recId,
        recommendationType: "refresh-job-posting",
        source: "autopilot",
        label: "Refresh",
      },
    });
    await upsertAutomationRecord(draft);
    await submitAutomationForApproval(session, draft.id);
    await approveAutomation(session, draft.id);

    const executed = await executeAutomation(session, draft.id);
    assert.equal(executed.ok, true);

    const records = await listRecommendationRecords();
    const tracked = records.find((row) => row.recommendationId === recId);
    assert.ok(tracked);
    assert.equal(tracked?.status, "Executed");
    assert.ok(tracked?.executionDate);
  });

  it("builds control center snapshot with funnel counts and ROI", async () => {
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    const posting = buildPostingDraftFromTerritory({
      territory: "Texas",
      state: "TX",
      city: "Dallas",
      openCalls: 8,
      activeJobs: 0,
      coveragePercent: 40,
    });
    const approved = { ...draft, id: "approved-1", approvalStatus: "Approved" as const, executionStatus: "Approved" as const };
    const completed = {
      ...draft,
      id: "completed-1",
      approvalStatus: "Completed" as const,
      executionStatus: "Completed" as const,
      executedAt: new Date().toISOString(),
    };
    await writeAutomationStore({
      automations: [draft, posting, approved, completed],
      safetyMode: "requires-approval",
      updatedAt: new Date().toISOString(),
    });

    const snapshot = buildAutomationControlCenterSnapshot({
      records: await listAutomationRecords(),
      safetyMode: "requires-approval",
      generatedAt: new Date().toISOString(),
    });
    assert.equal(snapshot.summary.draft, 2);
    assert.equal(snapshot.summary.approved, 1);
    assert.equal(snapshot.summary.completed, 1);
    assert.equal(snapshot.summary.executedCount, 1);
    assert.equal(snapshot.summary.executionSuccessRate, 100);
    assert.ok(snapshot.summary.roiGenerated.applicantsGained > 0);
    assert.equal(snapshot.jobRefreshDrafts.length, 3);
    assert.equal(snapshot.postingDrafts.length, 1);
    assert.equal(snapshot.queueAging.length, 4);
    assert.equal(snapshot.safetyMode, "requires-approval");
  });

  it("sorts automations by highest projected ROI first", () => {
    const low = buildJobRefreshDraftFromRecommendation(
      sampleRecommendation({ opportunity: { ...sampleRecommendation().opportunity, estimatedCandidateGain: 2 } }),
    );
    const high = buildJobRefreshDraftFromRecommendation(
      sampleRecommendation({ opportunity: { ...sampleRecommendation().opportunity, estimatedCandidateGain: 20 } }),
    );
    const snapshot = buildAutomationControlCenterSnapshot({
      records: [low, high],
      safetyMode: "requires-approval",
      generatedAt: new Date().toISOString(),
    });
    assert.equal(snapshot.jobRefreshDrafts[0]?.id, high.id);
  });

  it("merges duplicate drafts with same job territory action owner", () => {
    const a = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    const b = buildJobRefreshDraftFromRecommendation(sampleRecommendation({ reasoning: "Updated reason" }));
    b.id = "duplicate-id";
    const merged = mergeDuplicateAutomations([a, b]);
    assert.equal(merged.length, 1);
    assert.equal(buildAutomationDuplicateKey(merged[0]!), buildAutomationDuplicateKey(a));
  });

  it("builds queue aging buckets for open queue items", () => {
    const now = Date.parse("2026-06-15T12:00:00.000Z");
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    draft.createdAt = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const buckets = buildQueueAgingBuckets([draft], now);
    assert.equal(buckets.find((b) => b.id === "4-7")?.count, 1);
  });

  it("generates drafts from intelligence bundle without duplicate source ids", async () => {
    const bundle = minimalBundle();
    const existing = [
      buildJobRefreshDraftFromRecommendation(
        sampleRecommendation({ id: "autopilot:job:job-1" }),
      ),
    ];
    existing[0]!.sourceRecommendation = {
      recommendationId: "autopilot:job:job-1",
      recommendationType: "refresh-job-posting",
      source: "autopilot",
      label: "Refresh",
    };
    await writeAutomationStore({
      automations: existing,
      safetyMode: "requires-approval",
      updatedAt: bundle.fetchedAt,
    });

    const drafts = generateDraftsFromIntelligence({ bundle, existing, session });
    const refreshIds = drafts
      .filter((row) => row.actionType === "job-refresh")
      .map((row) => row.sourceRecommendation?.recommendationId);
    assert.ok(!refreshIds.includes("autopilot:job:job-1") || drafts.length === 0);
  });

  it("persists store to .data json file", async () => {
    const draft = buildJobRefreshDraftFromRecommendation(sampleRecommendation());
    await upsertAutomationRecord(draft);
    const store = await readAutomationStore();
    assert.equal(store.automations.length, 1);
    assert.equal(store.safetyMode, "requires-approval");
  });
});
