import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import type { CandidateAdvancementEngineOptions } from "@/lib/candidate-advancement-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  evaluateCandidate,
  type AdvancementNextAction,
  type CandidateAdvancementEvaluation,
} from "@/lib/recruiting/candidate-advancement-engine";
import type {
  PipelineCandidateAnalysis,
  PipelineDashboardMetrics,
  PipelineDashboardNextAction,
} from "@/lib/p151-autonomous-candidate-advancement/types";
import { RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD } from "@/lib/recruiter-assignment-engine/types";
import type { RecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/types";

const DASHBOARD_ACTIONS: PipelineDashboardNextAction[] = [
  "Assign Recruiter",
  "Recruiter Review",
  "Contact Candidate",
  "Send Paperwork",
  "Ready for MEL",
  "Hired",
  "Other",
];

function emptyPipelineFlow(): Record<PipelineDashboardNextAction, number> {
  return Object.fromEntries(DASHBOARD_ACTIONS.map((key) => [key, 0])) as Record<
    PipelineDashboardNextAction,
    number
  >;
}

export function mapToDashboardNextAction(nextAction: AdvancementNextAction): PipelineDashboardNextAction {
  switch (nextAction) {
    case "Assign Recruiter":
      return "Assign Recruiter";
    case "Needs Review":
    case "Escalate to DM":
    case "Wait":
      return "Recruiter Review";
    case "Call Candidate":
    case "Text Candidate":
    case "Email Candidate":
      return "Contact Candidate";
    case "Send Paperwork":
      return "Send Paperwork";
    case "Ready for MEL":
      return "Ready for MEL";
    case "Archive":
      return "Other";
    default:
      if (nextAction === ("Active Rep" as AdvancementNextAction)) return "Hired";
      return "Other";
  }
}

function mapWorkflowToDashboardStatus(status: string): PipelineDashboardNextAction {
  if (status === "Active Rep" || status === "Loaded in MEL") return "Hired";
  if (status === "Ready for MEL" || status === "Signed") return "Ready for MEL";
  return "Other";
}

export function resolvePreventingRule(input: {
  row: ScoredCandidateWorkflowRow;
  evaluation: CandidateAdvancementEvaluation;
  p83Reason: string;
  publishedJob: boolean;
  openProject: boolean;
}): { whyStopped: string; preventingRule: string; recommendedFix: string } {
  const { row, evaluation, p83Reason, publishedJob, openProject } = input;

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    return {
      whyStopped: "Candidate has no assigned recruiter — P144 cannot advance past Assign Recruiter.",
      preventingRule:
        "RULE:P144.mapP83Action — isUnassignedRecruiter(assignedRecruiter) forces nextAction=Assign Recruiter before any P83 advancement.",
      recommendedFix:
        "Run autonomous recruiter assignment when territory state and confidence ≥ 65 are satisfied (published job helpful but not required).",
    };
  }

  if (!publishedJob && !openProject) {
    return {
      whyStopped: "Original ad closed — checking operational fit before paperwork.",
      preventingRule:
        "RULE:P151.1 candidate-first — closed/unpublished original ad is a warning; assign recruiter and confirm operational fit.",
      recommendedFix:
        "Match candidate to nearest active published job by territory or route to Manual Review.",
    };
  }

  if (evaluation.blockers.includes("Project Closed")) {
    return {
      whyStopped: "Project/position is closed in Breezy.",
      preventingRule: "RULE:P144.detectBlockers — positionId not in published jobs map (Project Closed).",
      recommendedFix: "Reopen project or remap candidate to an active published position.",
    };
  }

  if (evaluation.blockers.includes("Missing Resume")) {
    return {
      whyStopped: "Resume missing — advancement blocked.",
      preventingRule: "RULE:P144.detectBlockers — hasResume=false.",
      recommendedFix: "Obtain resume or mark candidate not qualified.",
    };
  }

  if (evaluation.blockers.includes("Missing Questionnaire")) {
    return {
      whyStopped: "Questionnaire incomplete or tech readiness false.",
      preventingRule: "RULE:P144.detectBlockers — questionnaireIntelligence.techReady=false.",
      recommendedFix: "Complete questionnaire verification before paperwork.",
    };
  }

  if (evaluation.blockers.includes("Manual Review Required")) {
    return {
      whyStopped: "Workflow status or action requires manual review.",
      preventingRule: "RULE:P144.detectBlockers — workflowStatus=Needs Review or actionType=needs-review.",
      recommendedFix: "Recruiter manual review required before automation.",
    };
  }

  if (evaluation.blockers.includes("Duplicate Candidate")) {
    return {
      whyStopped: "Duplicate candidate flagged.",
      preventingRule: "RULE:P144.detectBlockers — duplicate noted in candidate notes or grade contributors.",
      recommendedFix: "Merge or archive duplicate record.",
    };
  }

  if (evaluation.blockers.includes("Distance Too Far")) {
    return {
      whyStopped: "Candidate distance exceeds 90 miles.",
      preventingRule: "RULE:P144.detectBlockers — distanceMiles > 90.",
      recommendedFix: "Confirm travel willingness or reassign to closer market.",
    };
  }

  if (evaluation.blockers.includes("Already Contacted")) {
    return {
      whyStopped: "Recent recruiter contact within 3 days.",
      preventingRule: "RULE:P144.detectBlockers — hasRecentRecruiterContact() within 3-day cooldown.",
      recommendedFix: "Wait for contact cooldown or document follow-up outcome.",
    };
  }

  if (p83Reason.includes("requireApproval") || p83Reason.includes("approval")) {
    return {
      whyStopped: "P83 advancement requires human approval.",
      preventingRule: "RULE:P83.buildCandidateAdvancementDecision — requireApproval=true blocks shouldAdvance.",
      recommendedFix: "Enable P151 with requireApproval bypass only after executive sign-off.",
    };
  }

  if (evaluation.nextAction === "Send Paperwork" && !evaluation.automationEligible) {
    return {
      whyStopped: evaluation.automationExplanation,
      preventingRule: `RULE:P144.automationEligibility — ${evaluation.automationExplanation}`,
      recommendedFix: "Resolve blockers and raise confidence to ≥ 80 for safe automation.",
    };
  }

  if (evaluation.nextAction === "Call Candidate") {
    return {
      whyStopped: p83Reason || "Recruiter contact required before paperwork.",
      preventingRule: `RULE:P83.buildCandidateAdvancementDecision — action=call-first: ${p83Reason}`,
      recommendedFix: "Recruiter calls candidate to verify questionnaire gaps or low confidence grade.",
    };
  }

  if (evaluation.nextAction === "Wait" || evaluation.nextAction === "Needs Review") {
    return {
      whyStopped: p83Reason || evaluation.reason,
      preventingRule: `RULE:P83.buildCandidateAdvancementDecision — action=hold: ${p83Reason}`,
      recommendedFix: "Resolve hold reason before re-evaluating advancement.",
    };
  }

  if (mapWorkflowToDashboardStatus(row.workflowStatus) === "Hired") {
    return {
      whyStopped: "Candidate already hired or loaded.",
      preventingRule: "RULE:P83.buildCandidateAdvancementDecision — terminal workflow status.",
      recommendedFix: "No action — candidate complete.",
    };
  }

  return {
    whyStopped: evaluation.reason || p83Reason || "No advancement signal.",
    preventingRule: p83Reason
      ? `RULE:P83 — ${p83Reason}`
      : `RULE:P144.evaluateCandidate — ${evaluation.reason}`,
    recommendedFix: evaluation.automationEligible
      ? "Eligible for autonomous advancement when P151 enabled."
      : "Resolve blockers listed above.",
  };
}

export function analyzePipelineCandidate(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  jobsByPositionId: Map<string, BreezyJob>;
  advancementOptions: CandidateAdvancementEngineOptions;
  referenceMs?: number;
}): PipelineCandidateAnalysis {
  const { row, candidate, jobsByPositionId, advancementOptions } = input;
  const referenceMs = input.referenceMs ?? Date.now();
  const job = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;
  const publishedJob = Boolean(job && job.status === "published");
  const openProject = publishedJob;

  const evaluation = evaluateCandidate({
    row,
    jobsByPositionId,
    advancementOptions,
    referenceMs,
  });

  const p83 = buildCandidateAdvancementDecision(row, advancementOptions);
  const hiredStatus = mapWorkflowToDashboardStatus(row.workflowStatus);
  const dashboardNextAction =
    hiredStatus === "Hired" || hiredStatus === "Ready for MEL"
      ? hiredStatus
      : mapToDashboardNextAction(evaluation.nextAction);

  const { whyStopped, preventingRule, recommendedFix } = resolvePreventingRule({
    row,
    evaluation,
    p83Reason: p83.reason,
    publishedJob,
    openProject,
  });

  const candidateName =
    `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.candidateId;

  return {
    candidateId: row.candidateId,
    candidateName,
    breezyStage: candidate.stage || row.stage || "—",
    workflowStatus: row.workflowStatus,
    nextAction: evaluation.nextAction,
    dashboardNextAction,
    recruiterAssigned: !isUnassignedRecruiter(row.assignedRecruiter),
    recruiter: row.assignedRecruiter || "Unassigned",
    publishedJob,
    openProject,
    projectName: row.positionName || job?.name || "—",
    confidence: evaluation.confidence,
    advancementScore: evaluation.advancementScore,
    blockers: evaluation.blockers,
    whyStopped,
    preventingRule,
    recommendedFix,
    automationEligible: evaluation.automationEligible,
    p83Action: p83.action,
    p83Reason: p83.reason,
  };
}

export function buildPipelineDashboardMetrics(input: {
  analysis: PipelineCandidateAnalysis[];
  auditAssignmentsToday: number;
  auditAdvancementsToday: number;
  stageAgeHoursByStatus: Record<string, number[]>;
}): PipelineDashboardMetrics {
  const pipelineFlow = emptyPipelineFlow();
  const nextActionCounts: Record<string, number> = {};
  const blockerCounts = new Map<string, number>();

  let waitingAssignment = 0;
  let blocked = 0;

  for (const item of input.analysis) {
    pipelineFlow[item.dashboardNextAction] += 1;
    nextActionCounts[item.nextAction] = (nextActionCounts[item.nextAction] ?? 0) + 1;
    if (item.dashboardNextAction === "Assign Recruiter") waitingAssignment += 1;
    if (!item.automationEligible && item.dashboardNextAction !== "Hired") blocked += 1;
    for (const blocker of item.blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
    if (!item.recruiterAssigned) {
      blockerCounts.set("Unassigned Recruiter", (blockerCounts.get("Unassigned Recruiter") ?? 0) + 1);
    }
  }

  const averageTimeInStageHours: Record<string, number> = {};
  for (const [status, hours] of Object.entries(input.stageAgeHoursByStatus)) {
    if (hours.length === 0) continue;
    averageTimeInStageHours[status] = Math.round(
      hours.reduce((sum, value) => sum + value, 0) / hours.length,
    );
  }

  return {
    candidatesWaitingAssignment: waitingAssignment,
    candidatesAdvancedToday: input.auditAdvancementsToday,
    assignmentsCompletedToday: input.auditAssignmentsToday,
    blockedCandidates: blocked,
    topBlockers: [...blockerCounts.entries()]
      .map(([blocker, count]) => ({ blocker, count }))
      .sort((a, b) => b.count - a.count),
    averageTimeInStageHours,
    pipelineFlow,
    nextActionCounts,
  };
}

export function isEligibleForAutonomousAssignment(
  analysis: PipelineCandidateAnalysis,
  assignmentDecision?: RecruiterAssignmentDecision,
): boolean {
  if (analysis.recruiterAssigned) return false;
  if (!assignmentDecision?.shouldAssign) return false;
  return (assignmentDecision.confidence ?? 0) >= RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD;
}

export function isEligibleForAutonomousAdvancement(
  analysis: PipelineCandidateAnalysis,
  requireApproval: boolean,
): boolean {
  if (!analysis.recruiterAssigned) return false;
  if (analysis.p83Action !== "send-paperwork") return false;
  if (requireApproval) return false;
  return analysis.automationEligible || analysis.nextAction === "Send Paperwork";
}

export function computeReadinessScore(analysis: PipelineCandidateAnalysis[]): number {
  if (analysis.length === 0) return 0;
  const assignable = analysis.filter((a) => a.dashboardNextAction === "Assign Recruiter").length;
  const sendReady = analysis.filter((a) => a.nextAction === "Send Paperwork").length;
  const automationReady = analysis.filter((a) => a.automationEligible).length;
  const unblocked = analysis.filter((a) => a.blockers.length === 0).length;
  const raw =
    (unblocked / analysis.length) * 30 +
    (automationReady / analysis.length) * 40 +
    (sendReady / analysis.length) * 20 +
    (1 - assignable / analysis.length) * 10;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
