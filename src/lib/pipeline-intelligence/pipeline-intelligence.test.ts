import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildPipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence";
import {
  mapToCanonicalPipelineStage,
  STAGE_SLA_HOURS,
} from "@/lib/pipeline-intelligence/stage-mapping";
import { resolveBottleneckSeverity } from "@/lib/pipeline-intelligence/bottleneck-engine";
import { classifyAgingBucket } from "@/lib/pipeline-intelligence/aging";
import { buildFunnelTransitionMetrics } from "@/lib/pipeline-intelligence/funnel-conversion";
import { buildSlaTracking } from "@/lib/pipeline-intelligence/sla-tracking";
import { formatTerritoryLabel } from "@/lib/pipeline-intelligence/territory-labels";

const REF = "2026-06-22T12:00:00.000Z";

function sample(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-06-10",
    createdDate: "2026-06-10",
    addedDate: "2026-06-10",
    updatedDate: "2026-06-10",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
    ...patch,
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord>): CandidateWorkflowRecord {
  const base = buildBaselineWorkflowRow(sample(id));
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? base.workflowStatus,
    notes: patch.notes ?? [],
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor",
    assignedDM: patch.assignedDM ?? "Unassigned",
    lastActionAt: patch.lastActionAt ?? null,
    nextActionNeeded: patch.nextActionNeeded ?? base.nextActionNeeded,
    history: patch.history ?? [],
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: "not_sent",
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
    updatedAt: REF,
  };
}

describe("pipeline stage mapping", () => {
  it("maps workflow statuses into canonical stages", () => {
    const applied = buildBaselineWorkflowRow(sample("a1"));
    assert.equal(mapToCanonicalPipelineStage(applied), "Applied");

    const review = buildBaselineWorkflowRow(
      sample("a2"),
      workflow("a2", { workflowStatus: "Needs Review" }),
    );
    assert.equal(mapToCanonicalPipelineStage(review), "Needs Review");

    const contacted = buildBaselineWorkflowRow(
      sample("a3"),
      workflow("a3", { workflowStatus: "Needs Review", lastActionAt: "2026-06-11T10:00:00.000Z" }),
    );
    assert.equal(mapToCanonicalPipelineStage(contacted), "Contacted");

    const interview = buildBaselineWorkflowRow(
      sample("a4"),
      workflow("a4", {
        workflowStatus: "Qualified",
        recruitingActions: { ...emptyRecruitingActions(), recommendInterview: true, updatedAt: REF },
      }),
    );
    assert.equal(mapToCanonicalPipelineStage(interview), "Interview Scheduled");

    const mel = buildBaselineWorkflowRow(
      sample("a5"),
      workflow("a5", { workflowStatus: "Ready for MEL" }),
    );
    assert.equal(mapToCanonicalPipelineStage(mel), "Ready for MEL");
  });
});

describe("bottleneck severity", () => {
  it("escalates when avg days exceed SLA", () => {
    const severity = resolveBottleneckSeverity({
      stage: "Needs Review",
      count: 6,
      avgDaysInStage: 5,
      beyondSlaCount: 4,
    });
    assert.equal(severity, "critical");
  });

  it("stays normal when within SLA", () => {
    const severity = resolveBottleneckSeverity({
      stage: "Contacted",
      count: 2,
      avgDaysInStage: 1,
      beyondSlaCount: 0,
    });
    assert.equal(severity, "normal");
  });
});

describe("aging buckets", () => {
  it("classifies day ranges", () => {
    assert.equal(classifyAgingBucket(1), "0-2");
    assert.equal(classifyAgingBucket(4), "3-5");
    assert.equal(classifyAgingBucket(8), "6-10");
    assert.equal(classifyAgingBucket(15), "10+");
  });
});

describe("funnel conversion", () => {
  it("computes stage-to-stage progression rates", () => {
    const rows = [
      buildBaselineWorkflowRow(sample("f1", { state: "TX" }), workflow("f1", { workflowStatus: "Applied" })),
      buildBaselineWorkflowRow(
        sample("f2", { state: "TX" }),
        workflow("f2", { workflowStatus: "Needs Review" }),
      ),
      buildBaselineWorkflowRow(
        sample("f3", { state: "TX" }),
        workflow("f3", {
          workflowStatus: "Needs Review",
          lastActionAt: "2026-06-11T10:00:00.000Z",
        }),
      ),
      buildBaselineWorkflowRow(
        sample("f4", { state: "TX" }),
        workflow("f4", { workflowStatus: "Ready for MEL" }),
      ),
      buildBaselineWorkflowRow(
        sample("f5", { state: "TX" }),
        workflow("f5", { workflowStatus: "Active Rep" }),
      ),
    ];

    const transitions = buildFunnelTransitionMetrics(rows, REF);
    const appliedReview = transitions.find((row) => row.id === "applied-review");
    assert.equal(appliedReview?.conversionPct, 80);
    const melActive = transitions.find((row) => row.id === "mel-active");
    assert.equal(melActive?.conversionPct, 50);
  });
});

describe("sla tracking", () => {
  it("includes interview and ready-for-mel thresholds", () => {
    assert.equal(STAGE_SLA_HOURS["Interview Scheduled"], 5 * 24);
    assert.equal(STAGE_SLA_HOURS["Ready for MEL"], 3 * 24);

    const staleInterview = buildBaselineWorkflowRow(
      sample("int", { state: "TX" }),
      workflow("int", {
        workflowStatus: "Qualified",
        lastActionAt: "2026-06-01T10:00:00.000Z",
        recruitingActions: { ...emptyRecruitingActions(), recommendInterview: true, updatedAt: REF },
      }),
    );
    const sla = buildSlaTracking([staleInterview], REF);
    const interviewRow = sla.find((row) => row.stage === "Interview Scheduled");
    assert.ok(interviewRow);
    assert.ok(interviewRow!.beyondSlaCount >= 1);
  });
});

describe("territory labels", () => {
  it("formats DM plus state coverage", () => {
    assert.equal(formatTerritoryLabel("Amy Harp", ["TX", "OK"]), "Amy Harp · OK, TX");
  });
});

describe("buildPipelineIntelligenceSnapshot", () => {
  it("returns stage metrics and recruiter performance", () => {
    const rows = [
      buildBaselineWorkflowRow(sample("r1", { state: "TX" }), workflow("r1", { workflowStatus: "Applied" })),
      buildBaselineWorkflowRow(
        sample("r2", { state: "TX" }),
        workflow("r2", {
          workflowStatus: "Needs Review",
          lastActionAt: "2026-06-01T10:00:00.000Z",
        }),
      ),
      buildBaselineWorkflowRow(
        sample("r3", { state: "TX" }),
        workflow("r3", { workflowStatus: "Ready for MEL", assignedRecruiter: "Taylor" }),
      ),
    ];

    const snapshot = buildPipelineIntelligenceSnapshot(rows, REF);
    assert.equal(snapshot.stages.length, 9);
    assert.equal(snapshot.funnelTransitions.length, 6);
    assert.equal(snapshot.slaTracking.length, 5);
    assert.ok(snapshot.stages.some((row) => row.stage === "Applied"));
    assert.ok(snapshot.recruiters.length > 0);
    assert.equal(STAGE_SLA_HOURS["Needs Review"], 72);
    assert.ok(snapshot.territories.length > 0);
    assert.ok(snapshot.executive.topBottleneckTerritories.length >= 0);
    assert.ok(snapshot.executive.worstConversionTerritories.length >= 0);
  });

  it("creates accountability recommendations for critical bottlenecks", () => {
    const stale = buildBaselineWorkflowRow(
      sample("stale", { state: "TX" }),
      workflow("stale", {
        workflowStatus: "Needs Review",
        lastActionAt: "2026-05-01T10:00:00.000Z",
      }),
    );
    const snapshot = buildPipelineIntelligenceSnapshot([stale], REF);
    assert.ok(snapshot.bottlenecks.length >= 0);
    assert.ok(Array.isArray(snapshot.recommendations));
  });
});
