import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceWorkflowOnComplete } from "@/lib/candidate-workspace/advance-workflow-on-complete";
import { buildCandidateTimeline } from "@/lib/candidate-workspace/build-candidate-timeline";
import { buildMelReadinessChecklist } from "@/lib/candidate-workspace/build-mel-readiness";
import { resolveWorkspaceAction } from "@/lib/candidate-workspace/resolve-workspace-action";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";

describe("candidate-workspace", () => {
  it("builds timeline with applied entry newest-sorted with history", () => {
    const timeline = buildCandidateTimeline({
      appliedDate: "2026-05-01T12:00:00.000Z",
      history: [
        {
          id: "h1",
          type: "status",
          message: "Status changed to Qualified.",
          createdAt: "2026-05-10T12:00:00.000Z",
        },
      ],
    });
    assert.equal(timeline.length, 2);
    assert.equal(timeline[0]?.label, "Status updated");
  });

  it("resolves assign to me for unassigned candidates before outreach actions", () => {
    const action = resolveWorkspaceAction({
      candidate: {
        workflowStatus: "Applied",
        assignedRecruiter: "Unassigned",
        recruitingActions: emptyRecruitingActions(),
        followUpDueAt: null,
        paperworkStatus: "not_sent",
        nextActionNeeded: "Review application",
      },
      actingRecruiter: "Taylor",
      sendBlockReason: null,
    });
    assert.equal(action.kind, "assign-me");
    assert.equal(action.label, "Assign to me");
  });

  it("resolves contact candidate for assigned applied status", () => {
    const action = resolveWorkspaceAction({
      candidate: {
        workflowStatus: "Applied",
        assignedRecruiter: "Taylor",
        recruitingActions: emptyRecruitingActions(),
        followUpDueAt: null,
        paperworkStatus: "none",
        nextActionNeeded: "Review application",
      },
      actingRecruiter: "Taylor",
      sendBlockReason: null,
    });
    assert.equal(action.kind, "contact-candidate");
    assert.equal(action.label, "Contact candidate");
  });

  it("advances applied contact to needs review", () => {
    const result = advanceWorkflowOnComplete("contact-candidate", {
      workflowStatus: "Applied",
      recruitingActions: emptyRecruitingActions(),
    });
    assert.equal(result.statusChange, "Needs Review");
    assert.equal(result.completeFollowUp, true);
  });

  it("builds mel readiness checklist from signed paperwork", () => {
    const items = buildMelReadinessChecklist({
      workflowStatus: "Signed",
      paperworkStatus: "signed",
      recruitingActions: emptyRecruitingActions(),
    });
    assert.equal(items.find((item) => item.id === "paperwork")?.complete, true);
    assert.equal(items.find((item) => item.id === "ready-mel")?.complete, false);
  });
});
