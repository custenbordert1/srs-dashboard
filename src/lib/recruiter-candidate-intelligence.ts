import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  buildCandidateSlaSnapshot,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
} from "@/lib/candidate-action-sla";
import {
  computeRecruiterAgingBucket,
  isNoResponseCandidate,
  RECRUITER_AGING_BUCKET_LABELS,
} from "@/lib/recruiter-action-queue-filters";
import {
  nextActionForWorkflowStatus,
  type CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";

export type RecruiterScanCueId =
  | "follow-up-overdue"
  | "interview"
  | "paperwork-stalled"
  | "ready-mel"
  | "unassigned"
  | "stale"
  | "high-fit"
  | "fresh-applicant";

export type RecruiterScanCue = {
  id: RecruiterScanCueId;
  label: string;
};

export type RecruiterFitSignal = {
  id: string;
  label: string;
};

const SCAN_PRIORITY: RecruiterScanCueId[] = [
  "follow-up-overdue",
  "interview",
  "paperwork-stalled",
  "ready-mel",
  "unassigned",
  "stale",
  "high-fit",
  "fresh-applicant",
];

const SCAN_LABELS: Record<RecruiterScanCueId, string> = {
  "follow-up-overdue": "Follow-up overdue",
  interview: "Interview ready",
  "paperwork-stalled": "Paperwork stalled",
  "ready-mel": "Ready for MEL",
  unassigned: "No owner",
  stale: "Stale touch",
  "high-fit": "High fit",
  "fresh-applicant": "New applicant",
};

export const RECRUITER_SCAN_CUE_STYLES: Record<RecruiterScanCueId, string> = {
  "follow-up-overdue": "border-red-500/40 bg-red-500/10 text-red-100",
  interview: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  "paperwork-stalled": "border-amber-500/40 bg-amber-500/10 text-amber-100",
  "ready-mel": "border-teal-500/40 bg-teal-500/10 text-teal-100",
  unassigned: "border-violet-500/35 bg-violet-500/10 text-violet-100",
  stale: "border-amber-500/35 bg-amber-500/8 text-amber-100/90",
  "high-fit": "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  "fresh-applicant": "border-cyan-500/35 bg-cyan-500/10 text-cyan-100",
};

const EXPERIENCE_TAG_PRIORITY = [
  "Walmart",
  "Target",
  "Grocery",
  "Resets",
  "Audits",
  "Planograms",
  "Retail merchandising",
  "Overnight travel",
] as const;

function slaForRow(row: ScoredCandidateWorkflowRow, referenceMs: number) {
  return buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });
}

function isPaperworkStalled(row: ScoredCandidateWorkflowRow, referenceMs: number): boolean {
  if (row.workflowStatus !== "Paperwork Sent" || row.paperworkStatus === "signed") return false;
  const sla = slaForRow(row, referenceMs);
  return sla.paperworkAgingSeverity === "warn" || sla.paperworkAgingSeverity === "critical";
}

function isFreshApplicant(row: ScoredCandidateWorkflowRow, referenceMs: number): boolean {
  const appliedHours = hoursSince(row.appliedDate, referenceMs);
  if (appliedHours !== null && appliedHours <= 48) return true;
  return row.intelligence.factors.responseSpeed >= 85;
}

function matchesScanCue(
  row: ScoredCandidateWorkflowRow,
  id: RecruiterScanCueId,
  referenceMs: number,
): boolean {
  switch (id) {
    case "follow-up-overdue":
      return (
        isFollowUpOverdue({
          recruitingActions: row.recruitingActions,
          followUpDueAt: row.followUpDueAt,
          referenceMs,
        }) || row.recruitingActions.needsFollowUp
      );
    case "interview":
      return row.recruitingActions.recommendInterview;
    case "paperwork-stalled":
      return isPaperworkStalled(row, referenceMs);
    case "ready-mel":
      return isMelReadyStatus(row.workflowStatus);
    case "unassigned":
      return isUnassignedRecruiter(row.assignedRecruiter);
    case "stale":
      return isNoResponseCandidate(row, referenceMs);
    case "high-fit":
      return row.isTopMatch || row.matchPercent >= 78;
    case "fresh-applicant":
      return isFreshApplicant(row, referenceMs);
    default:
      return false;
  }
}

/** Up to N highest-value scan cues (operational + fit), strongest first. */
export function buildRecruiterScanCues(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
  max = 2,
): RecruiterScanCue[] {
  const cues: RecruiterScanCue[] = [];
  for (const id of SCAN_PRIORITY) {
    if (matchesScanCue(row, id, referenceMs)) {
      cues.push({ id, label: SCAN_LABELS[id] });
    }
    if (cues.length >= max) break;
  }
  return cues;
}

/** Compact fit labels for table scan (max 2). */
export function buildRecruiterFitSignals(row: ScoredCandidateWorkflowRow, max = 2): RecruiterFitSignal[] {
  const signals: RecruiterFitSignal[] = [];
  const factors = row.intelligence?.factors;

  if (row.matchPercent > 0 || row.hasResume) {
    const conf =
      row.matchLevel === "high"
        ? "Strong match"
        : row.matchLevel === "medium"
          ? "Moderate match"
          : row.hasResume
            ? `${row.matchPercent}% match`
            : "Low resume signal";
    signals.push({ id: "match", label: conf });
  }

  if (factors && factors.travelRadius >= 65) {
    const miles =
      row.distanceMiles != null ? ` · ${row.distanceMiles} mi` : "";
    signals.push({
      id: "travel",
      label: factors.travelRadius >= 82 ? `Travel fit${miles}` : `Travel OK${miles}`,
    });
  } else if (row.distanceMiles != null && row.distanceMiles <= 35) {
    signals.push({ id: "travel", label: `${row.distanceMiles} mi radius` });
  }

  const merchScore = row.merchandisingExperienceScore ?? factors?.experience ?? 0;
  if (merchScore >= 12) {
    signals.push({
      id: "merch",
      label: merchScore >= 20 ? "Merch experience strong" : "Merch experience",
    });
  }

  if (row.skillTags.length > 0) {
    const ordered = EXPERIENCE_TAG_PRIORITY.filter((tag) => row.skillTags.includes(tag));
    for (const tag of ordered) {
      if (signals.some((s) => s.id === "exp-tag")) break;
      if (signals.length >= max) break;
      signals.push({ id: "exp-tag", label: tag });
    }
    if (!signals.some((s) => s.id === "exp-tag") && signals.length < max) {
      signals.push({ id: "exp-tag", label: row.skillTags[0]! });
    }
  }

  if (
    signals.length < max &&
    (row.skillTags.includes("Overnight travel") || row.aiBreakdown.travelWillingness >= 10)
  ) {
    signals.push({ id: "flex", label: "Multi-store travel" });
  }

  return signals.slice(0, max);
}

/** Context-aware recruiter next step — no LLM; uses workflow + SLA + scores in memory. */
export function deriveRecruiterNextAction(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): string {
  const sla = slaForRow(row, referenceMs);
  const agingBucket = computeRecruiterAgingBucket(row, referenceMs);
  const agingLabel = RECRUITER_AGING_BUCKET_LABELS[agingBucket];

  if (sla.followUpOverdue) {
    return "Contact candidate now — follow-up is overdue";
  }
  if (row.recruitingActions.recommendInterview) {
    return "Schedule interview — flagged as interview-ready";
  }
  if (row.workflowStatus === "Paperwork Sent" && row.paperworkStatus !== "signed") {
    if (sla.paperworkAgingSeverity === "critical") {
      return "Escalate signature — paperwork stalled 8+ days";
    }
    if (sla.paperworkAgingSeverity === "warn") {
      return "Nudge Dropbox Sign — paperwork aging 5+ days";
    }
    return "Check HelloSign status and resend packet if needed";
  }
  if (isMelReadyStatus(row.workflowStatus)) {
    return "Load into MEL — candidate is paperwork-ready";
  }
  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    if (row.isTopMatch || row.matchPercent >= 78) {
      return "Assign yourself — high-fit candidate has no owner";
    }
    return "Assign recruiter owner before next touch";
  }
  if (agingBucket !== "fresh") {
    if (row.recruitingActions.needsFollowUp) {
      return `Close follow-up loop — no touch (${agingLabel})`;
    }
    return `Re-engage candidate — recruiter silence (${agingLabel})`;
  }
  if (row.recruitingActions.priorityList) {
    return "Work priority queue — respond while applicant is warm";
  }
  if (row.recruitingActions.onboardingPacketPrep) {
    return "Finish onboarding packet prep, then send";
  }
  if (row.workflowStatus === "Qualified") {
    if (row.matchPercent >= 70) {
      return "Send paperwork — qualified with strong resume fit";
    }
    return "Confirm qualification, then move to paperwork";
  }
  if (row.workflowStatus === "Paperwork Needed") {
    return "Send onboarding packet via HelloSign";
  }
  if (row.workflowStatus === "Signed") {
    return "Verify signed docs and mark Ready for MEL";
  }
  if (row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review") {
    if (row.isTopMatch) {
      return "Fast-track review — top match for territory";
    }
    if (row.matchPercent >= 72) {
      return "Review resume fit and assign owner today";
    }
    if (!row.hasResume) {
      return "Request resume or screen without resume signals";
    }
    return "Review fit and disposition within 24h";
  }
  if (row.recruitingActions.dmReview) {
    return "Route to DM review with territory notes";
  }

  return contextualStatusAction(row.workflowStatus, row);
}

function contextualStatusAction(
  status: CandidateWorkflowStatus,
  row: ScoredCandidateWorkflowRow,
): string {
  const base = nextActionForWorkflowStatus(status);
  if (status === "Not Qualified" || status === "Active Rep" || status === "Loaded in MEL") {
    return base;
  }
  if (status === "Training Needed") {
    return "Confirm training schedule and rep readiness";
  }
  if (row.matchPercent >= 75 && (status === "Applied" || status === "Needs Review")) {
    return "Prioritize screen — strong merchandising match";
  }
  return base;
}

/** Prefer derived action unless recruiter saved a custom note in workflow overlay. */
export function resolveRecruiterNextAction(
  row: ScoredCandidateWorkflowRow,
  workflowStatus: CandidateWorkflowStatus,
  persisted?: string | null,
): string {
  const trimmed = persisted?.trim();
  const statusDefault = nextActionForWorkflowStatus(workflowStatus);
  if (trimmed && trimmed !== statusDefault) return trimmed;
  return deriveRecruiterNextAction(row);
}
