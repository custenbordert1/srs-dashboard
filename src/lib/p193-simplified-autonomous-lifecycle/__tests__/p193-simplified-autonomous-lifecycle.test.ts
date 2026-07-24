import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasApprovalEvidence,
  hasRecommendationEvidence,
} from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import { evaluateP193AiQualification } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import { buildP193Dashboard } from "@/lib/p193-simplified-autonomous-lifecycle/dashboard";
import { mapLegacyWorkflowToP193State } from "@/lib/p193-simplified-autonomous-lifecycle/migrationAdapter";
import {
  P193_BRIDGE_NOTE,
  P193_RECOMMENDED_STAGE,
  assertBridgeSafety,
  projectQualifiedToP192Prerequisites,
} from "@/lib/p193-simplified-autonomous-lifecycle/paperworkBridge";
import { advanceToReadyForAssignment } from "@/lib/p193-simplified-autonomous-lifecycle/readyForAssignment";
import {
  P193_EXPIRE_7D_MS,
  P193_REMINDER_1H_MS,
  planP193Reminder,
} from "@/lib/p193-simplified-autonomous-lifecycle/reminderEngine";
import { applyDropboxEventToP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/signatureAdapter";
import { isLegalP193Transition } from "@/lib/p193-simplified-autonomous-lifecycle/stateMachine";
import { createP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";
import {
  DEFAULT_P193_FLAGS,
  P193_FORBIDDEN_ACTIONS,
  P193_LIFECYCLE_STATES,
  emptyMetadata,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { validateP193SimplifiedArchitecture } from "@/lib/p193-simplified-autonomous-lifecycle/validate";

describe("P193 simplified autonomous lifecycle", () => {
  it("defines the simplified happy-path states", () => {
    assert.ok(P193_LIFECYCLE_STATES.includes("Applied"));
    assert.ok(P193_LIFECYCLE_STATES.includes("AI Reviewing"));
    assert.ok(P193_LIFECYCLE_STATES.includes("Qualified"));
    assert.ok(P193_LIFECYCLE_STATES.includes("Ready For Assignment"));
    assert.equal(isLegalP193Transition("Applied", "AI Reviewing"), true);
    assert.equal(isLegalP193Transition("Applied", "Signed"), false);
  });

  it("maps legacy recommend/OA/paperwork statuses into simplified states", () => {
    assert.equal(mapLegacyWorkflowToP193State({ workflowStatus: "Applied" }), "Applied");
    assert.equal(mapLegacyWorkflowToP193State({ workflowStatus: "Paperwork Needed" }), "Qualified");
    assert.equal(mapLegacyWorkflowToP193State({ workflowStatus: "Operator Approved" }), "Qualified");
    assert.equal(
      mapLegacyWorkflowToP193State({ workflowStatus: "Paperwork Sent", paperworkStatus: "viewed" }),
      "Awaiting Signature",
    );
    assert.equal(mapLegacyWorkflowToP193State({ workflowStatus: "Signed" }), "Signed");
    assert.equal(
      mapLegacyWorkflowToP193State({ workflowStatus: "Ready for MEL" }),
      "Ready For Assignment",
    );
  });

  it("AI qualification never auto-rejects borderline candidates", () => {
    const strong = evaluateP193AiQualification({
      candidate: {
        candidateId: "c1",
        firstName: "Pat",
        lastName: "Lee",
        email: "pat@example.com",
        phone: "5551234567",
        stage: "Applied",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        resumeText:
          "10 years merchandising reset planogram Walmart Target travel overnight territory merchandiser",
        hasResume: true,
        hasQuestionnaire: true,
        source: "Indeed",
        appliedDate: "2026-06-01",
        positionName: "Merchandiser",
      },
      questionnaireScore: 80,
      experienceYearsHint: 8,
      nearbyJobs: [{ jobId: "j1", title: "Merch", city: "Austin", state: "TX", zip: "78701" }],
    });
    assert.ok(["Qualified", "Needs Human Review"].includes(strong.decision));

    const borderline = evaluateP193AiQualification({
      candidate: {
        candidateId: "c2",
        firstName: "Sam",
        lastName: "Ray",
        email: "sam@example.com",
        phone: "5559998888",
        stage: "Applied",
        city: "Dallas",
        state: "TX",
        zipCode: "75201",
        resumeText: "retail associate",
        hasResume: true,
        hasQuestionnaire: false,
        source: "Indeed",
        appliedDate: "2026-06-02",
        positionName: "Merchandiser",
      },
      questionnaireScore: 40,
    });
    if (borderline.borderline) {
      assert.equal(borderline.decision, "Needs Human Review");
    }
    assert.equal(borderline.borderline && borderline.decision === "Not Qualified", false);
  });

  it("paperwork bridge projects P192-compatible evidence without changing P192", () => {
    const record = createP193Record({ candidateId: "bridge1", state: "Qualified" });
    const projection = projectQualifiedToP192Prerequisites({
      record,
      flags: { ...DEFAULT_P193_FLAGS, enabled: true, paperworkBridgeEnabled: true },
      authorized: true,
    });
    assert.equal(projection.shouldProject, true);
    assert.equal(projection.patch?.workflowStatus, "Paperwork Needed");
    assert.ok(hasRecommendationEvidence({ recommendedStage: projection.patch?.recommendedStage }));
    assert.ok(
      hasApprovalEvidence({
        notes: projection.patch?.notes ?? [],
        progressionReason: projection.patch?.progressionReason,
      }),
    );
    assert.equal(projection.patch?.recommendedStage, P193_RECOMMENDED_STAGE);
    assert.ok((projection.patch?.notes ?? []).some((n) => n.includes("P193_SIMPLIFIED")));
    assert.ok(P193_BRIDGE_NOTE.length > 0);
    assertBridgeSafety(projection);
  });

  it("bridge stays fail-closed when flags are off", () => {
    const record = createP193Record({ candidateId: "bridge2", state: "Qualified" });
    const projection = projectQualifiedToP192Prerequisites({
      record,
      flags: DEFAULT_P193_FLAGS,
      authorized: true,
    });
    assert.equal(projection.shouldProject, false);
    assert.ok(projection.blockers.includes("p193_disabled"));
  });

  it("reminder engine plans 1h unopened and 7d expire without duplicates", () => {
    const sentAt = new Date(Date.now() - P193_REMINDER_1H_MS - 1000).toISOString();
    const record = createP193Record({ candidateId: "r1", state: "Paperwork Sent" });
    record.metadata = {
      ...emptyMetadata(),
      paperworkStatus: "sent",
      reminderCount: 0,
      lastStatusChangeAt: sentAt,
    };
    record.timeline = [{ at: sentAt, state: "Paperwork Sent", detail: "sent" }];
    const plan = planP193Reminder(record);
    assert.equal(plan.action, "reminder_1h");

    record.metadata.reminderCount = 1;
    record.metadata.lastReminderAt = new Date().toISOString();
    const again = planP193Reminder(record);
    assert.equal(again.action, "none");

    const oldSent = new Date(Date.now() - P193_EXPIRE_7D_MS - 1000).toISOString();
    record.metadata.reminderCount = 2;
    record.timeline = [{ at: oldSent, state: "Paperwork Sent", detail: "sent" }];
    record.metadata.lastStatusChangeAt = oldSent;
    const expire = planP193Reminder(record);
    assert.equal(expire.action, "expire_7d");
  });

  it("signature adapter updates viewed and signed states", () => {
    let record = createP193Record({ candidateId: "s1", state: "Qualified" });
    record = applyDropboxEventToP193Record({
      record: { ...record, state: "Paperwork Sent", previousState: "Qualified" },
      eventType: "signature_request_sent",
    });
    assert.equal(record.metadata.paperworkStatus, "sent");
    record = applyDropboxEventToP193Record({
      record,
      eventType: "signature_request_viewed",
    });
    assert.equal(record.state, "Awaiting Signature");
    assert.equal(record.metadata.paperworkStatus, "viewed");
    record = applyDropboxEventToP193Record({
      record,
      eventType: "signature_request_all_signed",
    });
    assert.equal(record.state, "Signed");
  });

  it("ready for assignment populates projects and forbids MEL", () => {
    const record = createP193Record({ candidateId: "ready1", state: "Signed" });
    record.metadata.paperworkStatus = "signed";
    const result = advanceToReadyForAssignment({
      record,
      flags: { ...DEFAULT_P193_FLAGS, enabled: true, readyForAssignmentEnabled: true },
      authorized: true,
      city: "Austin",
      state: "TX",
      nearbyJobs: [{ jobId: "j1", title: "Merch", city: "Austin", state: "TX" }],
      availableProjects: [{ projectId: "p1", title: "Demo" }],
    });
    assert.equal(result.advanced, true);
    assert.equal(result.record.state, "Ready For Assignment");
    assert.equal(result.record.metadata.availableProjects.length, 1);
    assert.ok(P193_FORBIDDEN_ACTIONS.includes("mel_export"));
    assert.ok(P193_FORBIDDEN_ACTIONS.includes("mel_api"));
  });

  it("dashboard cards cover the simplified operator surface", () => {
    const records = [
      createP193Record({ candidateId: "d1", state: "Applied" }),
      createP193Record({ candidateId: "d2", state: "AI Reviewing" }),
      createP193Record({ candidateId: "d3", state: "Qualified" }),
    ];
    const dash = buildP193Dashboard(records);
    assert.equal(dash.cards.length, 9);
    assert.equal(dash.total, 3);
    assert.ok(dash.cards.some((c) => c.card === "New Applicants" && c.count === 1));
  });

  it("validation report confirms defaults disabled and cores untouched", () => {
    const report = validateP193SimplifiedArchitecture({ flags: DEFAULT_P193_FLAGS });
    assert.equal(report.ok, true);
    assert.equal(report.flags.enabled, false);
    assert.equal(report.flags.paperworkBridgeEnabled, false);
  });
});
