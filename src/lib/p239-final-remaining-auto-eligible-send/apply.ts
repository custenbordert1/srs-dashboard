import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { promotePaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P239_APPROVED_BY,
  P239_PHASE,
  P239_REQUIRED_RECRUITER,
  P239_SOURCE_PHASE,
  P239_TARGET_PN_STAGE,
  type P239DmAssignmentRow,
  type P239EvaluatedCandidate,
  type P239PromotionRow,
  type P239WorkflowSnapshot,
} from "@/lib/p239-final-remaining-auto-eligible-send/types";

export async function applyP239DmAssignment(input: {
  member: P239EvaluatedCandidate;
  approvedBy: string;
}): Promise<CandidateWorkflowRecord> {
  const dm = input.member.dm.proposedAssignedDM?.trim();
  if (!dm) {
    throw new Error(`P239 DM apply missing proposedAssignedDM for ${input.member.candidateId}`);
  }
  return upsertCandidateWorkflow({
    candidateId: input.member.candidateId,
    assignedDM: dm,
    audit: {
      action: "p239_authoritative_dm_assignment",
      byUserId: input.approvedBy,
      metadata: {
        phase: P239_PHASE,
        source: P239_SOURCE_PHASE,
        assignedDM: dm,
        dmSource: input.member.dm.reason ?? "p216_position_location_territory_routing",
        positionId: input.member.dm.positionId ?? input.member.positionId,
        routingState: input.member.dm.routingState ?? "",
        locationSource: input.member.dm.locationSource ?? "",
        confidence: "high",
      },
    },
  });
}

export async function applyP239DmAssignmentForMember(input: {
  member: P239EvaluatedCandidate;
  beforeWorkflows: Record<string, P239WorkflowSnapshot>;
  approvedBy?: string;
}): Promise<P239DmAssignmentRow> {
  const approvedBy = input.approvedBy ?? P239_APPROVED_BY;
  const member = input.member;
  const before = input.beforeWorkflows[member.candidateId];
  const beforeDm = String(before?.assignedDM ?? "Unassigned");
  const expected = member.dm.proposedAssignedDM ?? "";
  const failures: string[] = [];

  if (String(before?.assignedRecruiter ?? "").trim() !== P239_REQUIRED_RECRUITER) {
    failures.push(`recruiter is not ${P239_REQUIRED_RECRUITER}`);
  }
  if (!expected) failures.push("missing proposedAssignedDM");

  if (failures.length) {
    return {
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      displayName: member.displayName,
      assignedDMBefore: beforeDm,
      assignedDMAfter: beforeDm,
      routingState: member.dm.routingState,
      positionId: member.dm.positionId,
      applied: false,
      verifyOk: false,
      failures,
    };
  }

  const liveBefore = (await getCandidateWorkflowState())[member.candidateId];
  const liveBeforeDm = String(liveBefore?.assignedDM ?? beforeDm);
  if (liveBeforeDm.toLowerCase() === expected.toLowerCase()) {
    return {
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      displayName: member.displayName,
      assignedDMBefore: liveBeforeDm,
      assignedDMAfter: liveBeforeDm,
      routingState: member.dm.routingState,
      positionId: member.dm.positionId,
      applied: false,
      verifyOk: true,
      failures: [],
    };
  }

  let afterDm = liveBeforeDm;
  let applied = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const written = await applyP239DmAssignment({ member, approvedBy });
    afterDm = String(written.assignedDM ?? "Unassigned");
    applied = true;
    if (afterDm.toLowerCase() === expected.toLowerCase()) break;
    await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
  }

  const afterState = await getCandidateWorkflowState();
  const after = afterState[member.candidateId];
  const readBackDm = String(after?.assignedDM ?? afterDm);
  const finalDm =
    readBackDm.toLowerCase() === expected.toLowerCase() ? readBackDm : afterDm;
  const verifyFailures: string[] = [];
  if (finalDm.toLowerCase() !== expected.toLowerCase()) {
    verifyFailures.push(`assignedDM is "${finalDm}", expected "${expected}"`);
  }
  if (
    String(after?.assignedRecruiter ?? liveBefore?.assignedRecruiter ?? "").trim() !==
    P239_REQUIRED_RECRUITER
  ) {
    verifyFailures.push("recruiter changed unexpectedly");
  }

  return {
    candidateId: member.candidateId,
    redactedCandidateId: member.redactedCandidateId,
    displayName: member.displayName,
    assignedDMBefore: liveBeforeDm,
    assignedDMAfter: finalDm,
    routingState: member.dm.routingState,
    positionId: member.dm.positionId,
    applied,
    verifyOk: verifyFailures.length === 0,
    failures: verifyFailures,
  };
}

export async function promoteP239ToPaperworkNeeded(input: {
  member: P239EvaluatedCandidate;
  candidatesById: Map<string, BreezyCandidate>;
  policy: CandidateOnboardingPolicy;
  approvedBy?: string;
}): Promise<P239PromotionRow> {
  const approvedBy = input.approvedBy ?? P239_APPROVED_BY;
  const member = input.member;
  const candidate = input.candidatesById.get(member.candidateId);
  const failures: string[] = [];
  if (!candidate) failures.push("missing candidate profile");

  const beforeState = await getCandidateWorkflowState();
  const before = beforeState[member.candidateId];
  const stageBefore = String(before?.workflowStatus ?? "");

  if (failures.length || !candidate || !before) {
    return {
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      displayName: member.displayName,
      stageBefore,
      stageAfter: stageBefore,
      promoted: false,
      reason: "precheck_failed",
      failures: failures.length ? failures : ["missing workflow"],
    };
  }

  if (stageBefore === P239_TARGET_PN_STAGE) {
    return {
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      displayName: member.displayName,
      stageBefore,
      stageAfter: stageBefore,
      promoted: true,
      reason: "already_paperwork_needed",
      failures: [],
    };
  }

  const scored = buildScoredWorkflowRow(candidate, before);
  const policy = {
    ...input.policy,
    funnelPromotion: { enabled: true },
    dryRun: false,
  };
  const result = await promotePaperworkFunnel({
    candidates: [scored],
    policy,
    byUserId: approvedBy,
    dryRun: false,
  });

  const afterState = await getCandidateWorkflowState();
  const after = afterState[member.candidateId];
  const stageAfter = String(after?.workflowStatus ?? "");
  const promoted = stageAfter === P239_TARGET_PN_STAGE;
  if (!promoted) {
    failures.push(
      `promotion failed: promoted=${result.promoted} promotable=${result.promotable} stage=${stageAfter}`,
    );
  }
  if (String(after?.assignedRecruiter ?? "").trim() !== P239_REQUIRED_RECRUITER) {
    failures.push("recruiter drifted during promotion");
  }

  if (promoted && member.dm.proposedAssignedDM) {
    const dmNow = String(after?.assignedDM ?? "").trim();
    if (dmNow.toLowerCase() !== member.dm.proposedAssignedDM.trim().toLowerCase()) {
      await applyP239DmAssignment({ member, approvedBy });
    }
  }

  return {
    candidateId: member.candidateId,
    redactedCandidateId: member.redactedCandidateId,
    displayName: member.displayName,
    stageBefore,
    stageAfter,
    promoted,
    reason: promoted ? "p65_6_funnel_promotion" : "promotion_failed",
    failures,
  };
}
