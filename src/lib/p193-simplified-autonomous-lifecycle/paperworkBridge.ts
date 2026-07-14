/**
 * P192 paperwork bridge adapter.
 *
 * Does NOT modify P184/P191/P192 source. When enabled, projects P193 Qualified
 * candidates onto the *existing* legacy prerequisites that evaluateP192Eligibility
 * already requires:
 *   - workflowStatus = Paperwork Needed
 *   - recommendedStage contains "Qualified" / hire signal
 *   - notes contain operator-approved style audit marker (compatibility)
 *   - system recruiter assignment audit (not human ownership requirement)
 *
 * Default flags keep this OFF. Callers must pass explicit authorization.
 */
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P193Flags, P193LifecycleRecord } from "@/lib/p193-simplified-autonomous-lifecycle/types";

export const P193_BRIDGE_NOTE = "[P193_SIMPLIFIED] OPERATOR_APPROVED via AI qualification bridge";
export const P193_SYSTEM_RECRUITER = "P193 Autonomous";
export const P193_RECOMMENDED_STAGE = "Qualified — Ready for Paperwork";

export type P192BridgeProjection = {
  candidateId: string;
  shouldProject: boolean;
  blockers: string[];
  patch: Partial<CandidateWorkflowRecord> | null;
  audit: {
    recommendedHireAudit: string;
    operatorApprovalAudit: string;
    recruiterAssignmentAudit: string;
  };
};

export function projectQualifiedToP192Prerequisites(input: {
  record: P193LifecycleRecord;
  existing?: CandidateWorkflowRecord | null;
  flags: P193Flags;
  authorized: boolean;
}): P192BridgeProjection {
  const audit = {
    recommendedHireAudit: P193_RECOMMENDED_STAGE,
    operatorApprovalAudit: P193_BRIDGE_NOTE,
    recruiterAssignmentAudit: P193_SYSTEM_RECRUITER,
  };

  const blockers: string[] = [];
  if (!input.flags.enabled) blockers.push("p193_disabled");
  if (!input.flags.paperworkBridgeEnabled) blockers.push("paperwork_bridge_disabled");
  if (!input.authorized) blockers.push("not_authorized");
  if (input.record.state !== "Qualified") blockers.push("not_qualified_state");
  if (input.existing?.signatureRequestId) blockers.push("prior_envelope");
  if (
    input.existing?.paperworkStatus === "sent" ||
    input.existing?.paperworkStatus === "viewed" ||
    input.existing?.paperworkStatus === "signed"
  ) {
    blockers.push("paperwork_already_active");
  }

  if (blockers.length) {
    return {
      candidateId: input.record.candidateId,
      shouldProject: false,
      blockers,
      patch: null,
      audit,
    };
  }

  const notes = [...(input.existing?.notes ?? [])];
  if (!notes.some((n) => n.includes("P193_SIMPLIFIED"))) {
    notes.push(P193_BRIDGE_NOTE);
  }

  return {
    candidateId: input.record.candidateId,
    shouldProject: true,
    blockers: [],
    patch: {
      candidateId: input.record.candidateId,
      workflowStatus: "Paperwork Needed",
      recommendedStage: P193_RECOMMENDED_STAGE,
      assignedRecruiter:
        input.existing?.assignedRecruiter && input.existing.assignedRecruiter !== "Unassigned"
          ? input.existing.assignedRecruiter
          : P193_SYSTEM_RECRUITER,
      recruiterAssignmentSource: "auto",
      notes,
      nextActionNeeded: "Send paperwork",
      progressionReason: "P193 simplified AI qualification → paperwork bridge",
    },
    audit,
  };
}

/**
 * Safety assertion: bridge never requests MEL, recommend-hire APIs, or Dropbox sends.
 */
export function assertBridgeSafety(projection: P192BridgeProjection): void {
  const raw = JSON.stringify(projection);
  if (/mel_export|dropbox_sign_send|executeRecommendHire/i.test(raw)) {
    throw new Error("P193 bridge safety violation");
  }
}
