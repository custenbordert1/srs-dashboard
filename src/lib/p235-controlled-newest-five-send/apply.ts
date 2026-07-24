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
  P235_APPROVED_BY,
  P235_PHASE,
  P235_REQUIRED_RECRUITER,
  P235_SOURCE_PHASE,
  P235_TARGET_PN_STAGE,
  type P235DmAssignmentRow,
  type P235EvaluatedCandidate,
  type P235PromotionRow,
  type P235WorkflowSnapshot,
} from "@/lib/p235-controlled-newest-five-send/types";

/**
 * Authoritative DM write only — never recruiter, stage, paperwork, notes.
 */
export async function applyP235DmAssignment(input: {
  member: P235EvaluatedCandidate;
  approvedBy: string;
}): Promise<CandidateWorkflowRecord> {
  const dm = input.member.dm.proposedAssignedDM?.trim();
  if (!dm) {
    throw new Error(`P235 DM apply missing proposedAssignedDM for ${input.member.candidateId}`);
  }
  return upsertCandidateWorkflow({
    candidateId: input.member.candidateId,
    assignedDM: dm,
    audit: {
      action: "p235_authoritative_dm_assignment",
      byUserId: input.approvedBy,
      metadata: {
        phase: P235_PHASE,
        source: P235_SOURCE_PHASE,
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

export async function applyP235DmAssignments(input: {
  selected: P235EvaluatedCandidate[];
  beforeWorkflows: Record<string, P235WorkflowSnapshot>;
  approvedBy?: string;
}): Promise<{ rows: P235DmAssignmentRow[]; afterWorkflows: Record<string, CandidateWorkflowRecord> }> {
  const approvedBy = input.approvedBy ?? P235_APPROVED_BY;
  const rows: P235DmAssignmentRow[] = [];

  for (const member of input.selected) {
    const before = input.beforeWorkflows[member.candidateId];
    const beforeDm = String(before?.assignedDM ?? "Unassigned");
    const expected = member.dm.proposedAssignedDM ?? "";
    const failures: string[] = [];

    if (String(before?.assignedRecruiter ?? "").trim() !== P235_REQUIRED_RECRUITER) {
      failures.push(`recruiter is not ${P235_REQUIRED_RECRUITER}`);
    }
    if (!expected) failures.push("missing proposedAssignedDM");

    if (failures.length) {
      rows.push({
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
      });
      continue;
    }

    // Skip write if already correct
    if (beforeDm.toLowerCase() === expected.toLowerCase()) {
      rows.push({
        candidateId: member.candidateId,
        redactedCandidateId: member.redactedCandidateId,
        displayName: member.displayName,
        assignedDMBefore: beforeDm,
        assignedDMAfter: beforeDm,
        routingState: member.dm.routingState,
        positionId: member.dm.positionId,
        applied: false,
        verifyOk: true,
        failures: [],
      });
      continue;
    }

    await applyP235DmAssignment({ member, approvedBy });
    const afterState = await getCandidateWorkflowState();
    const after = afterState[member.candidateId];
    const afterDm = String(after?.assignedDM ?? "Unassigned");
    const verifyOk =
      afterDm.toLowerCase() === expected.toLowerCase() &&
      String(after?.assignedRecruiter ?? "").trim() === P235_REQUIRED_RECRUITER;
    if (!verifyOk) {
      failures.push(`DM read-back "${afterDm}" expected "${expected}"`);
    }

    rows.push({
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      displayName: member.displayName,
      assignedDMBefore: beforeDm,
      assignedDMAfter: afterDm,
      routingState: member.dm.routingState,
      positionId: member.dm.positionId,
      applied: true,
      verifyOk,
      failures,
    });
  }

  const afterWorkflows = await getCandidateWorkflowState();
  return { rows, afterWorkflows };
}

/**
 * Promote selected Applied candidates to Paperwork Needed via P65.6 funnel.
 */
export async function promoteP235ToPaperworkNeeded(input: {
  selected: P235EvaluatedCandidate[];
  candidatesById: Map<string, BreezyCandidate>;
  policy: CandidateOnboardingPolicy;
  approvedBy?: string;
}): Promise<{ rows: P235PromotionRow[] }> {
  const approvedBy = input.approvedBy ?? P235_APPROVED_BY;
  const rows: P235PromotionRow[] = [];
  const live = await getCandidateWorkflowState();

  for (const member of input.selected) {
    const wf = live[member.candidateId];
    const candidate = input.candidatesById.get(member.candidateId);
    const stageBefore = String(wf?.workflowStatus ?? "");
    const failures: string[] = [];

    if (!wf || !candidate) {
      rows.push({
        candidateId: member.candidateId,
        redactedCandidateId: member.redactedCandidateId,
        displayName: member.displayName,
        stageBefore,
        stageAfter: stageBefore,
        promoted: false,
        reason: "missing_workflow_or_candidate",
        failures: ["missing_workflow_or_candidate"],
      });
      continue;
    }

    if (stageBefore === P235_TARGET_PN_STAGE) {
      rows.push({
        candidateId: member.candidateId,
        redactedCandidateId: member.redactedCandidateId,
        displayName: member.displayName,
        stageBefore,
        stageAfter: stageBefore,
        promoted: true,
        reason: "already_paperwork_needed",
        failures: [],
      });
      continue;
    }

    const scored = buildScoredWorkflowRow(candidate, wf);
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

    const after = (await getCandidateWorkflowState())[member.candidateId];
    const stageAfter = String(after?.workflowStatus ?? "");
    const promoted = stageAfter === P235_TARGET_PN_STAGE;
    if (!promoted) {
      failures.push(
        `promotion failed: promoted=${result.promoted} promotable=${result.promotable} stage=${stageAfter}`,
      );
    }
    if (String(after?.assignedRecruiter ?? "").trim() !== P235_REQUIRED_RECRUITER) {
      failures.push("recruiter drifted during promotion");
    }

    rows.push({
      candidateId: member.candidateId,
      redactedCandidateId: member.redactedCandidateId,
      displayName: member.displayName,
      stageBefore,
      stageAfter,
      promoted,
      reason: promoted ? "p65_6_funnel_promotion" : "promotion_failed",
      failures,
    });
  }

  return { rows };
}
