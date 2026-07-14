import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import {
  buildFlowDiagramMarkdown,
  buildGapRecommendations,
  buildHiringRecommendationCodePath,
  classifyFurthestLegitimateStage,
  P188_SAFETY,
  runProductionGapAnalysis,
} from "@/lib/p188-production-workflow-gap-analysis";

function wf(partial: Partial<CandidateWorkflowRecord> & { candidateId: string }): CandidateWorkflowRecord {
  const now = "2026-07-13T12:00:00.000Z";
  return {
    candidateId: partial.candidateId,
    workflowStatus: partial.workflowStatus ?? "Applied",
    notes: partial.notes ?? [],
    assignedRecruiter: partial.assignedRecruiter ?? "Unassigned",
    assignedDM: partial.assignedDM ?? "Unassigned",
    lastActionAt: partial.lastActionAt ?? null,
    nextActionNeeded: partial.nextActionNeeded ?? "",
    history: partial.history ?? [],
    recruitingActions: partial.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: partial.paperworkSentAt ?? null,
    paperworkViewedAt: partial.paperworkViewedAt ?? null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: partial.paperworkStatus ?? "not_sent",
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_started",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    recommendedStage: partial.recommendedStage ?? null,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe("P188 production workflow gap analysis", () => {
  it("classifies furthest legitimate stages", () => {
    assert.equal(classifyFurthestLegitimateStage(wf({ candidateId: "a" })), "Applied");
    assert.equal(
      classifyFurthestLegitimateStage(wf({ candidateId: "b", workflowStatus: "Needs Review" })),
      "Recruiter Review",
    );
    assert.equal(
      classifyFurthestLegitimateStage(
        wf({
          candidateId: "c",
          workflowStatus: "Qualified",
          recommendedStage: "recommend_hire",
        }),
      ),
      "Hiring Recommendation",
    );
    assert.equal(
      classifyFurthestLegitimateStage(
        wf({ candidateId: "d", workflowStatus: "Paperwork Sent", paperworkStatus: "sent" }),
      ),
      "Paperwork Sent",
    );
    assert.equal(
      classifyFurthestLegitimateStage(
        wf({ candidateId: "e", workflowStatus: "Signed", paperworkStatus: "signed" }),
      ),
      "Signed",
    );
  });

  it("reports zero hiring recommendation on production-like fixture", () => {
    const report = runProductionGapAnalysis(
      [
        wf({ candidateId: "1", workflowStatus: "Applied" }),
        wf({ candidateId: "2", workflowStatus: "Paperwork Sent", paperworkStatus: "sent" }),
        wf({ candidateId: "3", workflowStatus: "Needs Review" }),
      ],
      { productionCommit: "testcommit" },
    );
    assert.equal(report.hiringRecommendationCount, 0);
    assert.ok(report.furthestStageCounts.Applied >= 1);
    assert.ok(report.furthestStageCounts["Paperwork Sent"] >= 1);
    assert.ok(report.zeroHiringRecommendationExplanation.length >= 3);
    assert.equal(report.safety.productionWrites, 0);
    assert.equal(report.safety.featureFlagsChanged, false);
  });

  it("traces HR code path statuses", () => {
    const path = buildHiringRecommendationCodePath();
    assert.ok(path.some((n) => n.id === "api-auto-progression" && n.status === "exists"));
    assert.ok(path.some((n) => n.id === "ui-enrichment" && n.status === "display_only"));
    assert.ok(path.some((n) => n.id === "reconcile-onboarding" && n.status === "executes"));
    assert.ok(path.some((n) => n.id === "dedicated-hr-api" && n.status === "never_called"));
    assert.ok(path.some((n) => n.id === "api-p151-advancement" && n.status === "disabled"));
  });

  it("recommendations cover missing HR transition", () => {
    const recs = buildGapRecommendations();
    assert.ok(recs.some((r) => /Hiring Recommendation/i.test(r.missingTransition)));
    assert.ok(recs.every((r) => r.proposedFix.length > 0));
  });

  it("flow diagram highlights stop point", () => {
    const md = buildFlowDiagramMarkdown("STOP HERE");
    assert.ok(md.includes("Hiring Recommendation"));
    assert.ok(md.includes("STOP HERE"));
  });

  it("safety walls are zero/false constants", () => {
    assert.deepEqual(P188_SAFETY, {
      productionWrites: 0,
      candidateStateChanges: 0,
      paperworkSends: 0,
      approvals: 0,
      melWrites: 0,
      automationEnabled: false,
      featureFlagsChanged: false,
    });
  });

  it("detects HR when recommendation evidence present", () => {
    const report = runProductionGapAnalysis([
      wf({
        candidateId: "hr1",
        workflowStatus: "Qualified",
        recommendedStage: "Send Paperwork",
        assignedRecruiter: "Taylor",
      }),
    ]);
    assert.equal(report.hiringRecommendationCount, 1);
    assert.equal(report.furthestStageCounts["Hiring Recommendation"], 1);
  });
});
