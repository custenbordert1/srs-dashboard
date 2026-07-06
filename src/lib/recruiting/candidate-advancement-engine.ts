import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildCandidateSlaSnapshot, isMelReadyStatus } from "@/lib/candidate-action-sla";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import type { CandidateAdvancementEngineOptions } from "@/lib/candidate-advancement-engine/types";
import type { LiveSnapshotCandidateMetadata } from "@/lib/p143-live-snapshot-ingestion-fallback/types";

/** Documented advancement score weights (sum = 100). */
export const ADVANCEMENT_SCORE_WEIGHTS = {
  questionnaireQuality: 15,
  resumeQuality: 15,
  relevantExperience: 15,
  distance: 10,
  coverageNeed: 10,
  projectPriority: 5,
  stageAging: 10,
  communicationActivity: 10,
  paperworkProgress: 5,
  responsiveness: 5,
} as const;

export type AdvancementScoreFactor = keyof typeof ADVANCEMENT_SCORE_WEIGHTS;

export type AdvancementNextAction =
  | "Call Candidate"
  | "Text Candidate"
  | "Email Candidate"
  | "Send Paperwork"
  | "Assign Recruiter"
  | "Escalate to DM"
  | "Ready for MEL"
  | "Wait"
  | "Needs Review"
  | "Archive";

export type AdvancementBlocker =
  | "Missing Resume"
  | "Missing Questionnaire"
  | "Duplicate Candidate"
  | "Project Closed"
  | "Distance Too Far"
  | "Already Contacted"
  | "Paperwork Pending"
  | "No Published Job"
  | "Manual Review Required";

export type HireProbabilityBand = 10 | 25 | 50 | 75 | 90;

export type AdvancementUrgency = "low" | "medium" | "high" | "critical";

export type CandidateAdvancementEvaluation = {
  candidateId: string;
  candidateName: string;
  positionName: string;
  projectName: string | null;
  recruiter: string;
  dm: string;
  workflowStatus: string;
  stageAgeDays: number | null;
  advancementScore: number;
  scoreFactors: Record<AdvancementScoreFactor, number>;
  confidence: number;
  estimatedHireProbability: HireProbabilityBand;
  nextAction: AdvancementNextAction;
  urgency: AdvancementUrgency;
  automationEligible: boolean;
  automationExplanation: string;
  blockers: AdvancementBlocker[];
  reason: string;
  recommendedRecruiterAction: string;
  coverageNeedScore: number;
  automationPreviewApproved: null;
  automationPreviewRejected: null;
};

export type CandidateAdvancementContext = {
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  advancementOptions: CandidateAdvancementEngineOptions;
  referenceMs?: number;
  coveragePressure?: number;
  projectPriority?: number;
  liveSnapshotMeta?: LiveSnapshotCandidateMetadata | null;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function factorScore(weight: number, ratio: number): number {
  return clampScore(weight * Math.max(0, Math.min(1, ratio)));
}

function hasRecentRecruiterContact(row: ScoredCandidateWorkflowRow, referenceMs: number): boolean {
  if (row.lastActionAt) {
    const daysSince = (referenceMs - new Date(row.lastActionAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince <= 3) return true;
  }
  return (row.history ?? []).some((event) => {
    const message = event.message.toLowerCase();
    return (
      message.includes("call") ||
      message.includes("email") ||
      message.includes("text") ||
      message.includes("sms") ||
      message.includes("contacted")
    );
  });
}

function communicationActivityRatio(row: ScoredCandidateWorkflowRow, referenceMs: number): number {
  if (hasRecentRecruiterContact(row, referenceMs)) return 0.85;
  if (row.recruitingActions.needsFollowUp) return 0.35;
  if (row.lastActionAt) return 0.6;
  return 0.35;
}

function computeScoreFactors(
  row: ScoredCandidateWorkflowRow,
  sla: ReturnType<typeof buildCandidateSlaSnapshot>,
  coveragePressure: number,
  projectPriority: number,
  referenceMs: number,
): Record<AdvancementScoreFactor, number> {
  const questionnaireRatio =
    row.questionnaireIntelligence.techReady === true
      ? 1
      : row.questionnaireIntelligence.techReady === false
        ? 0.2
        : 0.5;
  const resumeRatio = row.hasResume
    ? Math.min(1, (row.resumeIntelligence.relevantSkills.length + row.aiBreakdown.merchandisingKeywords) / 10)
    : 0;
  const experienceRatio = Math.min(1, row.matchPercent / 100);
  const distanceRatio =
    row.distanceMiles == null ? 0.6 : row.distanceMiles <= 25 ? 1 : row.distanceMiles <= 60 ? 0.7 : 0.3;
  const coverageRatio = Math.min(1, coveragePressure / 100);
  const projectRatio = Math.min(1, projectPriority / 100);
  const stageAgingRatio =
    sla.appliedDays == null ? 0.5 : sla.appliedDays <= 2 ? 1 : sla.appliedDays <= 7 ? 0.75 : 0.4;
  const communicationRatio = communicationActivityRatio(row, referenceMs);
  const paperworkRatio =
    row.paperworkStatus === "signed"
      ? 1
      : row.paperworkStatus === "sent" || row.paperworkStatus === "viewed"
        ? 0.8
        : row.workflowStatus === "Paperwork Needed"
          ? 0.5
          : 0.3;
  const responsivenessRatio = Math.min(
    1,
    (row.intelligence.factors.responseSpeed ?? row.aiBreakdown.stageProgression) / 100,
  );

  return {
    questionnaireQuality: factorScore(ADVANCEMENT_SCORE_WEIGHTS.questionnaireQuality, questionnaireRatio),
    resumeQuality: factorScore(ADVANCEMENT_SCORE_WEIGHTS.resumeQuality, resumeRatio),
    relevantExperience: factorScore(ADVANCEMENT_SCORE_WEIGHTS.relevantExperience, experienceRatio),
    distance: factorScore(ADVANCEMENT_SCORE_WEIGHTS.distance, distanceRatio),
    coverageNeed: factorScore(ADVANCEMENT_SCORE_WEIGHTS.coverageNeed, coverageRatio),
    projectPriority: factorScore(ADVANCEMENT_SCORE_WEIGHTS.projectPriority, projectRatio),
    stageAging: factorScore(ADVANCEMENT_SCORE_WEIGHTS.stageAging, stageAgingRatio),
    communicationActivity: factorScore(ADVANCEMENT_SCORE_WEIGHTS.communicationActivity, communicationRatio),
    paperworkProgress: factorScore(ADVANCEMENT_SCORE_WEIGHTS.paperworkProgress, paperworkRatio),
    responsiveness: factorScore(ADVANCEMENT_SCORE_WEIGHTS.responsiveness, responsivenessRatio),
  };
}

function sumFactors(factors: Record<AdvancementScoreFactor, number>): number {
  return clampScore(Object.values(factors).reduce((sum, value) => sum + value, 0));
}

function estimateHireProbability(
  advancementScore: number,
  row: ScoredCandidateWorkflowRow,
): HireProbabilityBand {
  if (row.workflowStatus === "Not Qualified") return 10;
  if (isMelReadyStatus(row.workflowStatus) || row.workflowStatus === "Active Rep") return 90;
  if (row.workflowStatus === "Signed" || row.workflowStatus === "Ready for MEL") return 75;
  if (row.workflowStatus === "Paperwork Sent" || row.paperworkStatus === "viewed") return 50;
  if (advancementScore >= 80 && row.aiGrade <= "B") return 75;
  if (advancementScore >= 65) return 50;
  if (advancementScore >= 45) return 25;
  return 10;
}

function estimateConfidence(
  advancementScore: number,
  blockers: AdvancementBlocker[],
  p83Confidence: number,
): number {
  const blockerPenalty = blockers.length * 8;
  return clampScore(Math.round(advancementScore * 0.45 + p83Confidence * 0.55 - blockerPenalty));
}

function detectBlockers(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
  referenceMs: number,
): AdvancementBlocker[] {
  const blockers: AdvancementBlocker[] = [];
  if (!row.hasResume) blockers.push("Missing Resume");
  if (row.questionnaireIntelligence.techReady === false) blockers.push("Missing Questionnaire");
  if ((row.notes ?? []).some((n) => /duplicate/i.test(n)) || row.candidateGrade.gradeContributors.some((c) => /duplicate/i.test(c.label))) {
    blockers.push("Duplicate Candidate");
  }
  const job = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;
  void job;
  if (row.distanceMiles != null && row.distanceMiles > 90) blockers.push("Distance Too Far");
  if (hasRecentRecruiterContact(row, referenceMs)) {
    blockers.push("Already Contacted");
  }
  if (row.workflowStatus === "Paperwork Sent" || row.paperworkStatus === "sent" || row.paperworkStatus === "viewed") {
    blockers.push("Paperwork Pending");
  }
  if (row.workflowStatus === "Needs Review" || row.actionType === "needs-review") {
    blockers.push("Manual Review Required");
  }
  return [...new Set(blockers)];
}

function mapP83Action(
  action: ReturnType<typeof buildCandidateAdvancementDecision>["action"],
  row: ScoredCandidateWorkflowRow,
): AdvancementNextAction {
  if (isMelReadyStatus(row.workflowStatus)) return "Ready for MEL";
  if (row.dmNeedsAssignment || isUnassignedRecruiter(row.assignedRecruiter)) return "Assign Recruiter";
  if (row.dmNeedsAssignment && row.suggestedDM) return "Escalate to DM";

  switch (action) {
    case "send-paperwork":
      return "Send Paperwork";
    case "call-first":
      return "Call Candidate";
    case "reject":
      return "Archive";
    case "hold":
      return row.workflowStatus === "Needs Review" ? "Needs Review" : "Wait";
    default:
      if (row.nextActionNeeded.toLowerCase().includes("text")) return "Text Candidate";
      if (row.nextActionNeeded.toLowerCase().includes("email")) return "Email Candidate";
      if (row.nextActionNeeded.toLowerCase().includes("call")) return "Call Candidate";
      return "Wait";
  }
}

function resolveUrgency(
  sla: ReturnType<typeof buildCandidateSlaSnapshot>,
  blockers: AdvancementBlocker[],
): AdvancementUrgency {
  if (sla.followUpOverdue || sla.appliedAgingSeverity === "critical") return "critical";
  if (sla.appliedAgingSeverity === "warn" || blockers.includes("Manual Review Required")) return "high";
  if (blockers.length > 0) return "medium";
  return "low";
}

function automationEligibility(input: {
  confidence: number;
  blockers: AdvancementBlocker[];
  nextAction: AdvancementNextAction;
  requiresApproval: boolean;
}): { eligible: boolean; explanation: string } {
  const manualBlockers = input.blockers.filter((b) => b !== "Already Contacted");
  if (input.requiresApproval) {
    return { eligible: false, explanation: "P83 advancement requires human approval before automation." };
  }
  if (manualBlockers.includes("Manual Review Required")) {
    return { eligible: false, explanation: "Manual review required — automation blocked." };
  }
  if (manualBlockers.length > 0) {
    return {
      eligible: false,
      explanation: `Blockers present: ${manualBlockers.join(", ")}.`,
    };
  }
  if (input.confidence < 80) {
    return { eligible: false, explanation: `Confidence ${input.confidence}% below automation threshold (80%).` };
  }
  if (!["Send Paperwork", "Wait", "Email Candidate"].includes(input.nextAction)) {
    return {
      eligible: false,
      explanation: `Action "${input.nextAction}" is not in the safe automation set for Phase 1.`,
    };
  }
  return {
    eligible: true,
    explanation: "High confidence, no blockers, safe action — eligible for automation preview.",
  };
}

export function evaluateCandidate(context: CandidateAdvancementContext): CandidateAdvancementEvaluation {
  const { row, jobsByPositionId, advancementOptions } = context;
  const referenceMs = context.referenceMs ?? Date.now();
  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });

  const coveragePressure = context.coveragePressure ?? Math.min(100, 40 + (row.matchPercent >= 70 ? 30 : 0));
  const projectPriority = context.projectPriority ?? (row.isTopMatch ? 85 : 50);
  const scoreFactors = computeScoreFactors(row, sla, coveragePressure, projectPriority, referenceMs);
  const advancementScore = sumFactors(scoreFactors);

  const p83 = buildCandidateAdvancementDecision(row, advancementOptions);
  const blockers = detectBlockers(row, jobsByPositionId, referenceMs);
  const nextAction = mapP83Action(p83.action, row);
  const confidence = estimateConfidence(advancementScore, blockers, p83.confidence);
  const estimatedHireProbability = estimateHireProbability(advancementScore, row);
  const urgency = resolveUrgency(sla, blockers);
  const automation = automationEligibility({
    confidence,
    blockers,
    nextAction,
    requiresApproval: p83.requiresApproval,
  });

  const candidateName =
    `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.candidateId;
  const job = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;

  const reasonParts = [
    `Advancement score ${advancementScore}/100.`,
    p83.reason,
    blockers.length > 0 ? `Blockers: ${blockers.join(", ")}.` : "No blockers detected.",
  ];

  return {
    candidateId: row.candidateId,
    candidateName,
    positionName: row.positionName || job?.name || "—",
    projectName: job?.name ?? null,
    recruiter: row.assignedRecruiter || "Unassigned",
    dm: row.assignedDM || row.suggestedDM || "Unassigned",
    workflowStatus: row.workflowStatus,
    stageAgeDays: sla.appliedDays,
    advancementScore,
    scoreFactors,
    confidence,
    estimatedHireProbability,
    nextAction,
    urgency,
    automationEligible: automation.eligible,
    automationExplanation: automation.explanation,
    blockers,
    reason: reasonParts.join(" "),
    recommendedRecruiterAction: row.nextActionNeeded || nextAction,
    coverageNeedScore: coveragePressure,
    automationPreviewApproved: null,
    automationPreviewRejected: null,
  };
}

export function evaluateCandidates(
  contexts: CandidateAdvancementContext[],
): CandidateAdvancementEvaluation[] {
  return contexts.map((context) => evaluateCandidate(context));
}
