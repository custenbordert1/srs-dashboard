import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCandidateRowPrimaryAction } from "@/lib/candidate-row-primary-action";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";

function baseCandidate(
  patch: Partial<{
    workflowStatus: "Applied" | "Paperwork Needed" | "Signed" | "Needs Review" | "Active Rep";
    assignedRecruiter: string;
    recruitingActions: ReturnType<typeof emptyRecruitingActions>;
    followUpDueAt: string | null;
    paperworkStatus: "not_sent" | "signed";
  }> = {},
) {
  return {
    workflowStatus: patch.workflowStatus ?? "Applied",
    assignedRecruiter: patch.assignedRecruiter ?? "Unassigned",
    recruitingActions: patch.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: patch.followUpDueAt ?? null,
    paperworkStatus: patch.paperworkStatus ?? "not_sent",
  };
}

describe("resolveCandidateRowPrimaryAction", () => {
  it("prioritizes send packet for paperwork-ready workflows", () => {
    const action = resolveCandidateRowPrimaryAction({
      candidate: baseCandidate({ workflowStatus: "Paperwork Needed" }),
      actingRecruiter: "Alex",
      sendBlockReason: null,
    });
    assert.equal(action.kind, "send-packet");
    assert.equal(action.label, "Send Packet");
  });

  it("disables send when blocked", () => {
    const action = resolveCandidateRowPrimaryAction({
      candidate: baseCandidate({ workflowStatus: "Paperwork Needed" }),
      actingRecruiter: "Alex",
      sendBlockReason: "pending_signature",
    });
    assert.equal(action.kind, "send-packet");
    assert.equal(action.disabled, true);
  });

  it("shows ready for MEL when signed", () => {
    const action = resolveCandidateRowPrimaryAction({
      candidate: baseCandidate({ workflowStatus: "Signed", paperworkStatus: "signed" }),
      actingRecruiter: "Alex",
      sendBlockReason: "already_signed",
    });
    assert.equal(action.kind, "ready-for-mel");
  });

  it("shows review for applied candidates", () => {
    const action = resolveCandidateRowPrimaryAction({
      candidate: baseCandidate({ workflowStatus: "Needs Review", assignedRecruiter: "Alex" }),
      actingRecruiter: "Alex",
      sendBlockReason: null,
    });
    assert.equal(action.kind, "review");
  });

  it("shows assign me when recruiter differs from acting", () => {
    const action = resolveCandidateRowPrimaryAction({
      candidate: baseCandidate({
        workflowStatus: "Active Rep",
        assignedRecruiter: "Other",
      }),
      actingRecruiter: "Alex",
      sendBlockReason: null,
    });
    assert.equal(action.kind, "assign-me");
  });
});
