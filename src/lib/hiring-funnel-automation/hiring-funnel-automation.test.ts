import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildRecruiterTasks,
  buildWorkloadBalanceRecommendations,
  evaluateCandidateFunnelAutomation,
} from "@/lib/hiring-funnel-automation";

const REF = Date.parse("2026-06-15T12:00:00.000Z");

function baseCandidate(id: string, patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Alex",
    lastName: "Rivera",
    email: `${id}@example.com`,
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-10",
    createdDate: "2026-06-10",
    addedDate: "2026-06-10",
    updatedDate: "2026-06-10",
    addedDateSource: "creation_date",
    positionId: "p1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
    hasResume: false,
    ...patch,
  };
}

function workflow(id: string, patch: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: id,
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: patch.assignedRecruiter ?? "Taylor Custenborder",
    assignedDM: patch.assignedDM ?? "Unassigned",
    notes: patch.notes ?? [],
    history: patch.history ?? [],
    lastActionAt: patch.lastActionAt ?? "2026-06-10T10:00:00.000Z",
    nextActionNeeded: patch.nextActionNeeded ?? "Review application",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    snoozedUntil: patch.snoozedUntil ?? null,
    paperworkStatus: patch.paperworkStatus ?? "not_sent",
    signatureRequestId: patch.signatureRequestId ?? null,
    paperworkTemplateKey: patch.paperworkTemplateKey ?? null,
    paperworkSentAt: patch.paperworkSentAt ?? null,
    paperworkSignedAt: patch.paperworkSignedAt ?? null,
    paperworkError: patch.paperworkError ?? null,
    directDepositStatus: patch.directDepositStatus ?? "not_requested",
    directDepositRequestedAt: patch.directDepositRequestedAt ?? null,
    directDepositLastReminderAt: patch.directDepositLastReminderAt ?? null,
    directDepositNotes: patch.directDepositNotes ?? null,
    directDepositTriggeredByUserId: patch.directDepositTriggeredByUserId ?? null,
    directDepositLastDeliveryMode: patch.directDepositLastDeliveryMode ?? null,
    directDepositLastHrCopyIncluded: patch.directDepositLastHrCopyIncluded ?? null,
    directDepositLastHrBccAddress: patch.directDepositLastHrBccAddress ?? null,
  };
}

describe("hiring funnel automation validation", () => {
  it("recommends outreach for new applicant", () => {
    const row = buildScoredWorkflowRow(baseCandidate("new"), workflow("new", { workflowStatus: "Applied" }));
    const automation = evaluateCandidateFunnelAutomation(row, REF);

    assert.equal(automation.stage, "Applied");
    assert.equal(automation.taskType, "recruiter-outreach");
    assert.match(automation.copilot.headline.toLowerCase(), /outreach|review/);
    assert.ok(automation.copilot.why.length > 0);
  });

  it("flags interview needed for qualified candidate", () => {
    const row = buildScoredWorkflowRow(
      baseCandidate("qualified", {
        stage: "Qualified",
        resumeText: "Walmart reset merchandiser with retail experience.",
        hasResume: true,
      }),
      workflow("qualified", {
        workflowStatus: "Qualified",
        recruitingActions: { ...emptyRecruitingActions(), recommendInterview: true },
      }),
    );
    const automation = evaluateCandidateFunnelAutomation(row, REF);

    assert.equal(automation.taskType, "interview-needed");
    assert.match(automation.copilot.headline.toLowerCase(), /interview|qualified/);
  });

  it("detects paperwork follow-up delay", () => {
    const row = buildScoredWorkflowRow(
      baseCandidate("paperwork"),
      workflow("paperwork", {
        workflowStatus: "Paperwork Sent",
        lastActionAt: "2026-06-05T10:00:00.000Z",
        paperworkSentAt: "2026-06-05T10:00:00.000Z",
        paperworkStatus: "sent",
      }),
    );
    const automation = evaluateCandidateFunnelAutomation(row, REF);

    assert.equal(automation.taskType, "paperwork-follow-up");
    assert.ok(automation.risk === "warning" || automation.risk === "critical");
    assert.match(automation.copilot.headline.toLowerCase(), /paperwork/);
  });

  it("creates MEL review task for ready candidate", () => {
    const row = buildScoredWorkflowRow(
      baseCandidate("mel"),
      workflow("mel", { workflowStatus: "Ready for MEL" }),
    );
    const automation = evaluateCandidateFunnelAutomation(row, REF);

    assert.equal(automation.taskType, "ready-for-mel-review");
    assert.match(automation.copilot.headline.toLowerCase(), /mel/);
    assert.equal(automation.automationEligible, true);
  });

  it("flags stalled candidate with critical risk", () => {
    const row = buildScoredWorkflowRow(
      baseCandidate("stalled"),
      workflow("stalled", {
        workflowStatus: "Needs Review",
        lastActionAt: "2026-05-20T10:00:00.000Z",
        followUpDueAt: "2026-06-01T10:00:00.000Z",
        recruitingActions: { ...emptyRecruitingActions(), followUpDue: true },
      }),
    );
    const automation = evaluateCandidateFunnelAutomation(row, REF);

    assert.equal(automation.risk, "critical");
    assert.ok(automation.riskReasons.some((reason) => reason.includes("Overdue") || reason.includes("stuck")));
  });

  it("assigns recruiter task when owner missing", () => {
    const row = buildScoredWorkflowRow(
      baseCandidate("unowned"),
      workflow("unowned", { assignedRecruiter: "Unassigned" }),
    );
    const automation = evaluateCandidateFunnelAutomation(row, REF);

    assert.equal(automation.owner, "Unassigned");
    assert.equal(automation.taskType, "assign-recruiter");
    assert.match(automation.copilot.headline.toLowerCase(), /assign/);
  });

  it("builds actionable recruiter tasks for owned pipeline", () => {
    const rows = [
      buildScoredWorkflowRow(baseCandidate("t1"), workflow("t1", { workflowStatus: "Applied" })),
      buildScoredWorkflowRow(
        baseCandidate("t2"),
        workflow("t2", {
          workflowStatus: "Qualified",
          recruitingActions: { ...emptyRecruitingActions(), recommendInterview: true },
        }),
      ),
    ];

    const tasks = buildRecruiterTasks(rows, { actingRecruiter: "Taylor Custenborder", referenceMs: REF });
    assert.ok(tasks.length >= 2);
    assert.ok(tasks.every((task) => task.href.includes("candidateId=")));
  });

  it("recommends workload escalation without auto-reassign", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      buildScoredWorkflowRow(
        baseCandidate(`w${index}`),
        workflow(`w${index}`, {
          workflowStatus: "Applied",
          lastActionAt: "2026-05-20T10:00:00.000Z",
          followUpDueAt: "2026-06-01T10:00:00.000Z",
          recruitingActions: { ...emptyRecruitingActions(), followUpDue: true },
        }),
      ),
    );

    const recommendations = buildWorkloadBalanceRecommendations(rows, REF);
    const recruiter = recommendations.find((row) => row.recruiter === "Taylor Custenborder");
    assert.ok(recruiter);
    assert.ok(recruiter!.activeTasks >= 3);
    assert.match(recruiter!.recommendation.toLowerCase(), /escalate|reassign|balanced/);
  });
});
