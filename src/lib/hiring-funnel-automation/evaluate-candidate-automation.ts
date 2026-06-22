import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateSlaSnapshot,
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
  isSnoozedUntil,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type {
  CandidateFunnelAutomation,
  FunnelRiskLevel,
  RecruiterCopilotRecommendation,
  RecruiterTaskType,
} from "@/lib/hiring-funnel-automation/types";
import { RECRUITER_TASK_LABELS } from "@/lib/hiring-funnel-automation/types";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function hasContributor(row: ScoredCandidateWorkflowRow, label: string): boolean {
  return row.candidateGrade.gradeContributors.some((item) => item.label.toLowerCase().includes(label.toLowerCase()));
}

function resolveTaskType(row: ScoredCandidateWorkflowRow, referenceMs: number): RecruiterTaskType | null {
  if (isUnassignedRecruiter(row.assignedRecruiter)) return "assign-recruiter";
  if (isMelReadyStatus(row.workflowStatus)) return "ready-for-mel-review";
  if (row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified") return "interview-needed";
  if (isPaperworkPendingStatus(row.workflowStatus)) return "paperwork-follow-up";
  if (row.questionnaireIntelligence.techReady === false) return "technology-verification";
  if (hasContributor(row, "Transportation not confirmed")) return "transportation-confirmation";
  if (
    row.workflowStatus === "Applied" ||
    row.workflowStatus === "Needs Review" ||
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    })
  ) {
    return "recruiter-outreach";
  }
  return null;
}

function resolveRisk(row: ScoredCandidateWorkflowRow, referenceMs: number): { risk: FunnelRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    lastActionAt: row.lastActionAt,
    workflowStatus: row.workflowStatus,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });

  if (isUnassignedRecruiter(row.assignedRecruiter)) reasons.push("Missing recruiter owner");
  if (isFollowUpOverdue({ recruitingActions: row.recruitingActions, followUpDueAt: row.followUpDueAt, referenceMs })) {
    reasons.push("Overdue follow-up");
  }
  if (sla.paperworkAgingSeverity === "critical") reasons.push("Paperwork delay");
  if (sla.appliedAgingSeverity === "critical" || sla.recruiterInactivitySeverity === "critical") {
    reasons.push("Candidate stuck too long");
  }
  if (row.recruitingActions.recommendInterview && (hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0) >= 72) {
    reasons.push("Interview scheduling delay");
  }
  if (isMelReadyStatus(row.workflowStatus) && (calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0) >= 3) {
    reasons.push("MEL-ready backlog");
  }
  if (
    row.candidateGrade.confidence === "low" &&
    (row.candidateGrade.grade === "A" || row.candidateGrade.grade === "B")
  ) {
    reasons.push("High grade with low confidence — verify before advancing");
  }

  if (reasons.some((r) => r.includes("Overdue") || r.includes("Missing") || r.includes("critical"))) {
    return { risk: "critical", reasons };
  }
  if (reasons.length > 0) return { risk: "warning", reasons };
  return { risk: "healthy", reasons };
}

function buildCopilot(row: ScoredCandidateWorkflowRow, referenceMs: number): RecruiterCopilotRecommendation {
  const name = candidateName(row);
  const grade = row.candidateGrade;
  const paperworkDays = calendarDaysSince(row.paperworkSentAt ?? row.lastActionAt, referenceMs);

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    return {
      headline: "Assign a recruiter owner",
      why: `${name} has no assigned recruiter.`,
      recommendedAction: "Assign yourself or the correct recruiter before outreach.",
      expectedOutcome: "Candidate enters an owned workflow with clear next steps.",
    };
  }

  if (row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified") {
    return {
      headline: "Candidate appears qualified for interview.",
      why: `Workflow status is ${row.workflowStatus} and interview is recommended.`,
      recommendedAction: grade.recommendedNextAction || `Schedule interview with ${name}.`,
      expectedOutcome: "Move candidate to interview stage and confirm project fit.",
    };
  }

  if (isPaperworkPendingStatus(row.workflowStatus) && paperworkDays !== null && paperworkDays >= 4) {
    return {
      headline: `Paperwork has been outstanding for ${paperworkDays} days.`,
      why: `Paperwork status is ${row.paperworkStatus} with no recent completion.`,
      recommendedAction: `Follow up with ${name} on outstanding paperwork.`,
      expectedOutcome: "Paperwork completed or blockers identified.",
    };
  }

  if (hasContributor(row, "Transportation not confirmed")) {
    return {
      headline: "Transportation not confirmed.",
      why: "Travel or availability was not confirmed in resume or questionnaire data.",
      recommendedAction: `Confirm transportation and travel radius with ${name}.`,
      expectedOutcome: "Recruiter can validate project coverage before advancing.",
    };
  }

  if (row.resumeIntelligence.signalBadges.some((b) => b.id === "retail" && b.detected)) {
    return {
      headline: "Strong retail experience detected.",
      why: "Retail experience signals were found on the resume profile.",
      recommendedAction: grade.recommendedNextAction || `Review ${name} and proceed with recruiter outreach.`,
      expectedOutcome: "Qualified retail background validated for merchandising roles.",
    };
  }

  if (row.questionnaireIntelligence.techReady === false) {
    return {
      headline: "Technology readiness needs verification.",
      why: "Questionnaire answers indicate missing smartphone, internet, or app comfort.",
      recommendedAction: `Call ${name} to confirm tech setup before advancing.`,
      expectedOutcome: "Tech readiness confirmed or disqualifying gaps documented.",
    };
  }

  if (isMelReadyStatus(row.workflowStatus)) {
    return {
      headline: "Candidate is ready for MEL review.",
      why: `Workflow status is ${row.workflowStatus}.`,
      recommendedAction: "Complete MEL readiness checklist and advance when confirmed.",
      expectedOutcome: "Candidate loaded into MEL without delay.",
    };
  }

  return {
    headline: "Recommend recruiter outreach.",
    why: grade.recommendedNextAction || `Next action: ${row.nextActionNeeded}.`,
    recommendedAction: grade.recommendedNextAction || row.nextActionNeeded,
    expectedOutcome: "Recruiter contacts candidate within SLA and advances workflow.",
  };
}

function resolveAutomationEligible(row: ScoredCandidateWorkflowRow, referenceMs: number): boolean {
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return false;
  if (isSnoozedUntil(row.snoozedUntil, referenceMs)) return false;
  if (isUnassignedRecruiter(row.assignedRecruiter)) return true;
  if (isPaperworkPendingStatus(row.workflowStatus) && row.email?.trim()) return true;
  if (row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review") return true;
  if (isMelReadyStatus(row.workflowStatus)) return true;
  return false;
}

export function evaluateCandidateFunnelAutomation(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): CandidateFunnelAutomation {
  const { risk, reasons } = resolveRisk(row, referenceMs);
  const taskType = resolveTaskType(row, referenceMs);
  const copilot = buildCopilot(row, referenceMs);

  return {
    candidateId: row.candidateId,
    stage: row.workflowStatus,
    nextAction: row.nextActionNeeded,
    owner: row.assignedRecruiter.trim() || "Unassigned",
    risk,
    automationEligible: resolveAutomationEligible(row, referenceMs),
    copilot,
    taskType,
    taskLabel: taskType ? RECRUITER_TASK_LABELS[taskType] : null,
    riskReasons: reasons,
  };
}

export function baselineCandidateFunnelAutomation(candidateId: string): CandidateFunnelAutomation {
  return {
    candidateId,
    stage: "Needs Review",
    nextAction: "Review application",
    owner: "Unassigned",
    risk: "healthy",
    automationEligible: false,
    copilot: {
      headline: "Enriching automation signals…",
      why: "Candidate intelligence is still loading.",
      recommendedAction: "Open workspace after scores finish loading.",
      expectedOutcome: "Copilot recommendation available once data loads.",
    },
    taskType: null,
    taskLabel: null,
    riskReasons: [],
  };
}
