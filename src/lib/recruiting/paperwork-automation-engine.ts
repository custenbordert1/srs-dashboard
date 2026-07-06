import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { hoursSince } from "@/lib/candidate-action-sla";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { isEligibleForSend } from "@/lib/candidate-onboarding-engine/build-onboarding-decisions";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";

/** Minimum hours between recruiter communications (P145 spec). */
export const P145_COMMUNICATION_COOLDOWN_HOURS = 24;

/** Hours after send before reminder #1. */
export const P145_REMINDER_1_HOURS = 24;

/** Hours after send before reminder #2. */
export const P145_REMINDER_2_HOURS = 48;

export type PaperworkRecommendedAction =
  | "Send Initial Paperwork"
  | "Send Reminder #1"
  | "Send Reminder #2"
  | "Escalate Recruiter"
  | "Escalate DM"
  | "Wait"
  | "Manual Review"
  | "Archive";

export type PaperworkAutomationBlocker =
  | "Completed Paperwork"
  | "Archived Candidate"
  | "Closed Project"
  | "Duplicate Candidate"
  | "Cancelled Onboarding"
  | "Recent Contact Cooldown"
  | "Missing Email"
  | "No Published Job"
  | "Unassigned Recruiter"
  | "Manual Review Required";

export type PaperworkQueueItem = {
  candidateId: string;
  candidateName: string;
  recruiter: string;
  project: string;
  currentStage: string;
  paperworkStatus: string;
  paperworkAgeHours: number | null;
  lastCommunication: string | null;
  recommendedAction: PaperworkRecommendedAction;
  confidence: number;
  blockers: PaperworkAutomationBlocker[];
  approvalRequired: true;
  reason: string;
};

export type PaperworkAutomationContext = {
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
  advancement?: CandidateAdvancementEvaluation | null;
  onboardingPolicy?: CandidateOnboardingPolicy;
  referenceMs?: number;
};

const TERMINAL_STATUSES = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
]);

const ARCHIVED_HINTS = ["archived", "withdrawn", "disqualified", "rejected"];

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.candidateId;
}

function isArchivedCandidate(row: ScoredCandidateWorkflowRow): boolean {
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return true;
  const haystack = `${row.workflowStatus} ${row.stage}`.toLowerCase();
  return ARCHIVED_HINTS.some((hint) => haystack.includes(hint));
}

function isPaperworkComplete(row: ScoredCandidateWorkflowRow): boolean {
  return row.paperworkStatus === "signed" || row.workflowStatus === "Signed";
}

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

function isReadyToSend(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
  onboarding: CandidateOnboardingRecord | null,
  policy?: CandidateOnboardingPolicy,
): boolean {
  if (isPaperworkComplete(row) || hasActivePacket(row)) return false;
  const eligibility = buildPaperworkSendEligibility({ row, onboarding, jobsByPositionId });
  return eligibility.eligible || isEligibleForSend(row, policy);
}

function isPaperworkOutstanding(row: ScoredCandidateWorkflowRow): boolean {
  return hasActivePacket(row) || row.workflowStatus === "Paperwork Sent";
}

function lastCommunicationAt(row: ScoredCandidateWorkflowRow): string | null {
  if (row.lastActionAt) return row.lastActionAt;
  const commEvents = (row.history ?? [])
    .filter((event) => {
      const message = event.message.toLowerCase();
      return (
        message.includes("email") ||
        message.includes("text") ||
        message.includes("sms") ||
        message.includes("call") ||
        message.includes("reminder") ||
        message.includes("paperwork")
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return commEvents[0]?.createdAt ?? null;
}

function isWithinCommunicationCooldown(row: ScoredCandidateWorkflowRow, referenceMs: number): boolean {
  const lastAt = lastCommunicationAt(row);
  if (!lastAt) return false;
  const hours = hoursSince(lastAt, referenceMs);
  return hours != null && hours < P145_COMMUNICATION_COOLDOWN_HOURS;
}

function detectExclusionBlockers(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
  onboarding: CandidateOnboardingRecord | null,
  referenceMs: number,
): PaperworkAutomationBlocker[] {
  const blockers: PaperworkAutomationBlocker[] = [];

  if (isPaperworkComplete(row)) blockers.push("Completed Paperwork");
  if (isArchivedCandidate(row)) blockers.push("Archived Candidate");
  if (onboarding?.status === "declined" || onboarding?.status === "expired" || onboarding?.status === "failed") {
    blockers.push("Cancelled Onboarding");
  }
  const job = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;
  if (!row.positionId?.trim() || !job) blockers.push("Closed Project");
  if (!job && row.positionId?.trim()) blockers.push("No Published Job");
  if (
    (row.notes ?? []).some((n) => /duplicate/i.test(n)) ||
    duplicatePaperworkSendBlockReason({ activeOnboarding: onboarding ?? undefined })
  ) {
    blockers.push("Duplicate Candidate");
  }
  if (!row.email?.trim()) blockers.push("Missing Email");
  if (isUnassignedRecruiter(row.assignedRecruiter)) blockers.push("Unassigned Recruiter");
  if (row.workflowStatus === "Needs Review" || row.actionType === "needs-review") {
    blockers.push("Manual Review Required");
  }
  if (isWithinCommunicationCooldown(row, referenceMs)) {
    blockers.push("Recent Contact Cooldown");
  }

  return [...new Set(blockers)];
}

function resolveRecommendedAction(input: {
  row: ScoredCandidateWorkflowRow;
  blockers: PaperworkAutomationBlocker[];
  readyToSend: boolean;
  outstanding: boolean;
  paperworkAgeHours: number | null;
  advancement?: CandidateAdvancementEvaluation | null;
}): PaperworkRecommendedAction {
  const { row, blockers, readyToSend, outstanding, paperworkAgeHours, advancement } = input;

  if (blockers.includes("Archived Candidate") || row.workflowStatus === "Not Qualified") {
    return "Archive";
  }
  if (blockers.includes("Manual Review Required")) return "Manual Review";
  if (blockers.includes("Recent Contact Cooldown")) return "Wait";

  if (readyToSend && !outstanding) return "Send Initial Paperwork";

  if (outstanding && paperworkAgeHours != null) {
    if (row.paperworkStatus === "viewed" && paperworkAgeHours >= 48) return "Escalate Recruiter";
    if (paperworkAgeHours >= P145_REMINDER_2_HOURS) return "Send Reminder #2";
    if (paperworkAgeHours >= P145_REMINDER_1_HOURS) return "Send Reminder #1";
    if (row.dmNeedsAssignment || isUnassignedRecruiter(row.assignedDM)) {
      return "Escalate DM";
    }
    return "Wait";
  }

  if (advancement?.nextAction === "Send Paperwork") return "Send Initial Paperwork";
  return "Manual Review";
}

function estimateConfidence(input: {
  row: ScoredCandidateWorkflowRow;
  blockers: PaperworkAutomationBlocker[];
  readyToSend: boolean;
  outstanding: boolean;
  advancement?: CandidateAdvancementEvaluation | null;
}): number {
  let score = 55;
  if (input.readyToSend) score += 20;
  if (input.outstanding) score += 10;
  if (input.advancement) score += Math.round(input.advancement.confidence * 0.25);
  score -= input.blockers.length * 8;
  if (input.blockers.includes("Recent Contact Cooldown")) score -= 5;
  if (input.blockers.includes("Manual Review Required")) score -= 15;
  return clampConfidence(score);
}

function buildReason(
  action: PaperworkRecommendedAction,
  blockers: PaperworkAutomationBlocker[],
  paperworkAgeHours: number | null,
): string {
  const parts = [`Recommended: ${action}.`];
  if (paperworkAgeHours != null) parts.push(`Paperwork age ${Math.round(paperworkAgeHours)}h.`);
  if (blockers.length > 0) parts.push(`Blockers: ${blockers.join(", ")}.`);
  else parts.push("No blockers — eligible for recruiter approval.");
  parts.push("Approval required before any send or reminder.");
  return parts.join(" ");
}

export function evaluatePaperworkCandidate(context: PaperworkAutomationContext): PaperworkQueueItem | null {
  const { row, jobsByPositionId, onboarding, advancement, onboardingPolicy } = context;
  const referenceMs = context.referenceMs ?? Date.now();

  const exclusionBlockers = detectExclusionBlockers(row, jobsByPositionId, onboarding, referenceMs);
  const hardExclude = exclusionBlockers.some((b) =>
    ["Completed Paperwork", "Archived Candidate", "Cancelled Onboarding", "Duplicate Candidate"].includes(b),
  );
  if (hardExclude) return null;

  const readyToSend = isReadyToSend(row, jobsByPositionId, onboarding, onboardingPolicy);
  const outstanding = isPaperworkOutstanding(row);
  if (!readyToSend && !outstanding) return null;

  const paperworkAgeHours = row.paperworkSentAt ? hoursSince(row.paperworkSentAt, referenceMs) : null;
  const blockers = exclusionBlockers;
  const recommendedAction = resolveRecommendedAction({
    row,
    blockers,
    readyToSend,
    outstanding,
    paperworkAgeHours,
    advancement,
  });

  const job = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;

  return {
    candidateId: row.candidateId,
    candidateName: candidateName(row),
    recruiter: row.assignedRecruiter || "Unassigned",
    project: row.positionName || job?.name || "—",
    currentStage: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    paperworkAgeHours,
    lastCommunication: lastCommunicationAt(row),
    recommendedAction,
    confidence: estimateConfidence({ row, blockers, readyToSend, outstanding, advancement }),
    blockers,
    approvalRequired: true,
    reason: buildReason(recommendedAction, blockers, paperworkAgeHours),
  };
}

export function buildPaperworkQueue(contexts: PaperworkAutomationContext[]): PaperworkQueueItem[] {
  return contexts
    .map((context) => evaluatePaperworkCandidate(context))
    .filter((item): item is PaperworkQueueItem => item != null)
    .sort((a, b) => b.confidence - a.confidence);
}
