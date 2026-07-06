import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { dmAssignmentNeedsAttention } from "@/lib/candidate-dm-suggest";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import type { CandidatePipelineStage } from "@/lib/p151-workflow-bottleneck-resolution/types";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import {
  evaluateInitialPaperworkEligibility,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import {
  evaluatePaperworkCandidate,
} from "@/lib/recruiting/paperwork-automation-engine";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";

function simulateWorkflowRow(
  row: ScoredCandidateWorkflowRow,
  patches: {
    assignedDM?: string;
    workflowStatus?: CandidateWorkflowRecord["workflowStatus"];
    actionType?: CandidateWorkflowRecord["actionType"];
    requiredAction?: string | null;
  },
): ScoredCandidateWorkflowRow {
  const next = { ...row, ...patches };
  if (patches.assignedDM) {
    next.assignedDM = patches.assignedDM;
    next.dmNeedsAssignment = dmAssignmentNeedsAttention(next.assignedDM, next.suggestedDM);
  }
  return next;
}

export function evaluateCandidatePipelineStage(input: {
  candidate: BreezyCandidate;
  workflow: CandidateWorkflowRecord | undefined;
  jobsByPositionId: Map<string, BreezyJob>;
  referenceMs: number;
  requireApproval: boolean;
  auditEvents: PaperworkAutomationAuditEvent[];
  mechanicalPatches?: {
    assignTerritoryDm?: boolean;
    advanceToPaperworkNeeded?: boolean;
  };
}): CandidatePipelineStage {
  const { candidate, workflow, jobsByPositionId, referenceMs, requireApproval, auditEvents } = input;
  let row = buildScoredWorkflowRow(candidate, workflow, {
    job: jobsByPositionId.get(candidate.positionId ?? ""),
  });

  const patches: Parameters<typeof simulateWorkflowRow>[1] = {};

  if (input.mechanicalPatches?.assignTerritoryDm && row.suggestedDM && row.dmNeedsAssignment) {
    patches.assignedDM = row.suggestedDM;
  }

  if (patches.assignedDM) {
    row = simulateWorkflowRow(row, patches);
  }

  const advancementOptions = {
    jobsByPositionId,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    requireApproval,
  };

  let p83 = buildCandidateAdvancementDecision(row, advancementOptions);

  if (input.mechanicalPatches?.advanceToPaperworkNeeded && p83.action === "send-paperwork" && !requireApproval) {
    patches.workflowStatus = "Paperwork Needed";
    patches.actionType = "send-paperwork";
    patches.requiredAction = "Send Paperwork";
    row = simulateWorkflowRow(row, patches);
    p83 = buildCandidateAdvancementDecision(row, { ...advancementOptions, requireApproval: false });
  }

  const advancement = evaluateCandidate({
    row,
    jobsByPositionId,
    advancementOptions: { ...advancementOptions, requireApproval },
    referenceMs,
  });

  const queueItem = evaluatePaperworkCandidate({
    row,
    jobsByPositionId,
    onboarding: null,
    advancement,
    referenceMs,
  });

  const eligibility = evaluateInitialPaperworkEligibility({
    context: { row, jobsByPositionId, onboarding: null, advancement, referenceMs },
    advancement,
    auditEvents,
    referenceMs,
    candidateFirstMode: false,
  });

  const paperworkNeeded = row.workflowStatus === "Paperwork Needed";
  const readyForPaperwork =
    paperworkNeeded && queueItem?.recommendedAction === "Send Initial Paperwork";
  const sendPaperwork = eligibility.eligible;

  let primaryBlocker: string | null = null;
  if (!paperworkNeeded) {
    if (p83.action !== "send-paperwork") {
      primaryBlocker = `P83 action=${p83.action}: ${p83.reason}`;
    } else if (requireApproval) {
      primaryBlocker = "requireApproval=true blocks shouldAdvance";
    } else if (row.workflowStatus !== "Paperwork Needed") {
      primaryBlocker = `workflowStatus=${row.workflowStatus} (expected Paperwork Needed)`;
    }
  } else if (!readyForPaperwork) {
    primaryBlocker = queueItem?.reason ?? "Not in P145 paperwork queue";
  } else if (!sendPaperwork) {
    primaryBlocker = eligibility.blockedReason ?? "P147 eligibility failed";
  }

  const candidateName =
    `${row.firstName ?? candidate.firstName ?? ""} ${row.lastName ?? candidate.lastName ?? ""}`.trim() ||
    candidate.candidateId;

  return {
    candidateId: candidate.candidateId,
    candidateName,
    paperworkNeeded,
    readyForPaperwork,
    sendPaperwork,
    workflowStatus: row.workflowStatus,
    p144NextAction: advancement.nextAction,
    p145Decision: queueItem?.recommendedAction ?? "NOT_IN_QUEUE",
    p147Decision: eligibility.eligible ? "ELIGIBLE" : "BLOCKED",
    primaryBlocker,
  };
}

export function countPipelineStages(candidates: CandidatePipelineStage[]): {
  paperworkNeeded: number;
  readyForPaperwork: number;
  sendPaperwork: number;
} {
  return {
    paperworkNeeded: candidates.filter((c) => c.paperworkNeeded).length,
    readyForPaperwork: candidates.filter((c) => c.readyForPaperwork).length,
    sendPaperwork: candidates.filter((c) => c.sendPaperwork).length,
  };
}
