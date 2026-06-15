import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildQueueCandidateRow,
  isUnassignedRecruiter,
  type QueueCandidateRow,
} from "@/lib/candidate-action-queue";
import {
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { resolveCandidateRowPrimaryAction } from "@/lib/candidate-row-primary-action";
import type { SendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";
import { deriveRecruiterNextAction } from "@/lib/recruiter-candidate-intelligence";
import type {
  BuildGuidedRecruitingInput,
  CandidateActionHistoryEntry,
  DailyRecruitingScoreboard,
  GuidedRecruitingSnapshot,
  GuidedWorkflowQuickAction,
  GuidedWorkflowQuickActionId,
  RecruiterInboxItem,
  RecruiterInboxReasonId,
  RecruiterProductivityToday,
  SmartFollowUpQueue,
  TeamLeaderRecruiterRow,
} from "@/lib/guided-recruiting-workflow/types";
import { pickWorkNextCandidate } from "@/lib/guided-recruiting-workflow/work-next-priority";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;

const INBOX_REASON_LABELS: Record<RecruiterInboxReasonId, string> = {
  "new-applicant": "New Applicant",
  "paperwork-waiting": "Paperwork Waiting",
  "ready-for-mel": "Ready For MEL",
  "dm-request": "DM Request",
  escalation: "Escalation",
};

const OPEN_STATUSES: CandidateWorkflowStatus[] = [
  "Applied",
  "Needs Review",
  "Qualified",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Training Needed",
];

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || row.candidateId;
}

function projectLabel(row: ScoredCandidateWorkflowRow): string {
  const position = row.positionName?.trim() || "Open role";
  const location = [row.city, row.state].filter(Boolean).join(", ");
  return location ? `${position} – ${location}` : position;
}

function isSameCalendarDay(iso: string | null, referenceMs: number): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const ref = new Date(referenceMs);
  return (
    date.getUTCFullYear() === ref.getUTCFullYear() &&
    date.getUTCMonth() === ref.getUTCMonth() &&
    date.getUTCDate() === ref.getUTCDate()
  );
}

function isWithinMs(iso: string | null, referenceMs: number, windowMs: number): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return referenceMs - date.getTime() <= windowMs && referenceMs >= date.getTime();
}

function isFollowUpDueOnDay(
  followUpDueAt: string | null,
  referenceMs: number,
  dayOffset: number,
): boolean {
  if (!followUpDueAt) return false;
  const due = new Date(followUpDueAt);
  if (Number.isNaN(due.getTime())) return false;
  const ref = new Date(referenceMs);
  ref.setUTCDate(ref.getUTCDate() + dayOffset);
  return (
    due.getUTCFullYear() === ref.getUTCFullYear() &&
    due.getUTCMonth() === ref.getUTCMonth() &&
    due.getUTCDate() === ref.getUTCDate()
  );
}

function resolveInboxReason(row: QueueCandidateRow): RecruiterInboxReasonId | null {
  if (row.recruitingActions.priorityList) return "escalation";
  if (isMelReadyStatus(row.workflowStatus)) return "ready-for-mel";
  if (isPaperworkPendingStatus(row.workflowStatus)) return "paperwork-waiting";
  if (row.recruitingActions.dmReview || row.dmNeedsAssignment) return "dm-request";
  if (row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review") {
    return "new-applicant";
  }
  if (
    row.recruitingActions.needsFollowUp ||
    row.followUpDueAt ||
    row.sla.followUpOverdue
  ) {
    return "new-applicant";
  }
  return null;
}

function buildFollowUpQueue(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs: number,
): SmartFollowUpQueue {
  let today = 0;
  let tomorrow = 0;
  let overdue = 0;

  for (const candidate of candidates) {
    if (candidate.assignedRecruiter.trim() !== actingRecruiter.trim()) continue;
    const row = buildQueueCandidateRow(candidate, referenceMs);
    if (!row.recruitingActions.needsFollowUp && !row.followUpDueAt) continue;

    if (row.followUpDueAt) {
      const dueMs = new Date(row.followUpDueAt).getTime();
      if (!Number.isNaN(dueMs) && dueMs <= referenceMs) {
        overdue += 1;
        continue;
      }
      if (isFollowUpDueOnDay(row.followUpDueAt, referenceMs, 0)) {
        today += 1;
        continue;
      }
      if (isFollowUpDueOnDay(row.followUpDueAt, referenceMs, 1)) {
        tomorrow += 1;
        continue;
      }
    }

    if (row.sla.followUpOverdue) {
      overdue += 1;
    }
  }

  return { today, tomorrow, overdue };
}

function countProductivityToday(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs: number,
): RecruiterProductivityToday {
  let candidatesWorked = 0;
  let followUpsCompleted = 0;
  let paperworkSent = 0;
  let readyForMel = 0;
  let newAssignments = 0;

  for (const row of candidates) {
    if (row.assignedRecruiter.trim() !== actingRecruiter.trim()) continue;

    if (isSameCalendarDay(row.lastActionAt, referenceMs)) {
      candidatesWorked += 1;
    }
    if (isSameCalendarDay(row.paperworkSentAt, referenceMs)) {
      paperworkSent += 1;
    }
    if (isMelReadyStatus(row.workflowStatus) && isSameCalendarDay(row.lastActionAt, referenceMs)) {
      readyForMel += 1;
    }
    if (isSameCalendarDay(row.appliedDate, referenceMs)) {
      newAssignments += 1;
    }

    for (const event of row.history) {
      if (!isSameCalendarDay(event.createdAt, referenceMs)) continue;
      if (event.type === "follow_up" && event.message.toLowerCase().includes("cleared")) {
        followUpsCompleted += 1;
      }
    }
  }

  return {
    candidatesWorked,
    followUpsCompleted,
    paperworkSent,
    readyForMel,
    newAssignments,
    goals: {
      candidatesWorked: 12,
      followUpsCompleted: 8,
      paperworkSent: 5,
      readyForMel: 3,
    },
  };
}

function buildInbox(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs: number,
): RecruiterInboxItem[] {
  const items: RecruiterInboxItem[] = [];

  for (const candidate of candidates) {
    const row = buildQueueCandidateRow(candidate, referenceMs);
    if (row.sla.isSnoozed) continue;
    if (
      row.workflowStatus === "Not Qualified" ||
      row.workflowStatus === "Active Rep" ||
      row.workflowStatus === "Loaded in MEL"
    ) {
      continue;
    }

    const owned = row.assignedRecruiter.trim() === actingRecruiter.trim();
    const reasonId = resolveInboxReason(row);
    if (!reasonId) continue;
    if (!owned && reasonId !== "new-applicant" && reasonId !== "escalation") continue;
    if (!owned && reasonId === "new-applicant" && !isUnassignedRecruiter(row.assignedRecruiter)) {
      continue;
    }

    items.push({
      candidateId: row.candidateId,
      candidateName: candidateName(row),
      projectLabel: projectLabel(row),
      reasonId,
      reasonLabel: INBOX_REASON_LABELS[reasonId],
      recommendedAction: deriveRecruiterNextAction(row, referenceMs),
      priorityScore: row.priorityScore,
      overdue: row.sla.followUpOverdue,
    });
  }

  return items
    .sort((a, b) => b.priorityScore - a.priorityScore || a.candidateName.localeCompare(b.candidateName))
    .slice(0, 25);
}

function buildActionHistory(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
): CandidateActionHistoryEntry[] {
  const entries: CandidateActionHistoryEntry[] = [];

  for (const row of candidates) {
    if (row.assignedRecruiter.trim() !== actingRecruiter.trim()) continue;
    const latest = row.history[0];
    if (!latest) continue;
    entries.push({
      candidateId: row.candidateId,
      candidateName: candidateName(row),
      actorLabel: row.assignedRecruiter.trim() || "Recruiter",
      actionLabel: latest.message,
      occurredAt: latest.createdAt,
    });
  }

  return entries
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 12);
}

function buildTeamLeaderRows(
  candidates: ScoredCandidateWorkflowRow[],
  recruiters: string[],
  referenceMs: number,
): TeamLeaderRecruiterRow[] {
  return recruiters
    .filter((name) => name.trim() && name.trim().toLowerCase() !== "unassigned")
    .map((recruiterName) => {
      const owned = candidates.filter((row) => row.assignedRecruiter.trim() === recruiterName.trim());
      const open = owned.filter((row) => OPEN_STATUSES.includes(row.workflowStatus));
      const workedToday = owned.filter((row) => isSameCalendarDay(row.lastActionAt, referenceMs)).length;
      const openActions = open.filter(
        (row) =>
          row.recruitingActions.needsFollowUp ||
          isPaperworkPendingStatus(row.workflowStatus) ||
          isMelReadyStatus(row.workflowStatus),
      ).length;
      const paperworkAging = open.filter((row) => {
        const sla = buildQueueCandidateRow(row, referenceMs);
        return sla.sla.paperworkAgingSeverity === "warn" || sla.sla.paperworkAgingSeverity === "critical";
      }).length;
      const melReadyBacklog = open.filter((row) => isMelReadyStatus(row.workflowStatus)).length;
      const productivityScore = Math.min(
        100,
        workedToday * 8 + openActions * 2 + melReadyBacklog * 5,
      );

      return {
        recruiterName,
        assignedOpen: open.length,
        candidatesWorkedToday: workedToday,
        openActions,
        paperworkAging,
        melReadyBacklog,
        productivityScore,
      };
    })
    .sort((a, b) => b.openActions - a.openActions || b.productivityScore - a.productivityScore);
}

function countScoreboardPeriod(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs: number,
  windowMs: number,
  label: string,
) {
  let candidatesWorked = 0;
  let paperworkSent = 0;
  let readyForMel = 0;
  let placements = 0;

  for (const row of candidates) {
    if (row.assignedRecruiter.trim() !== actingRecruiter.trim()) continue;
    if (isWithinMs(row.lastActionAt, referenceMs, windowMs)) candidatesWorked += 1;
    if (isWithinMs(row.paperworkSentAt, referenceMs, windowMs)) paperworkSent += 1;
    if (isMelReadyStatus(row.workflowStatus) && isWithinMs(row.lastActionAt, referenceMs, windowMs)) {
      readyForMel += 1;
    }
    if (
      (row.workflowStatus === "Active Rep" || row.workflowStatus === "Loaded in MEL") &&
      isWithinMs(row.paperworkSignedAt ?? row.lastActionAt, referenceMs, windowMs)
    ) {
      placements += 1;
    }
  }

  return { label, candidatesWorked, paperworkSent, readyForMel, placements };
}

function buildScoreboard(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs: number,
): DailyRecruitingScoreboard {
  return {
    today: countScoreboardPeriod(candidates, actingRecruiter, referenceMs, MS_PER_DAY, "Today"),
    week: countScoreboardPeriod(candidates, actingRecruiter, referenceMs, MS_PER_WEEK, "This Week"),
    month: countScoreboardPeriod(candidates, actingRecruiter, referenceMs, MS_PER_MONTH, "This Month"),
  };
}

function buildNextBestActionCard(
  row: QueueCandidateRow,
  actingRecruiter: string,
  sendBlockReason: SendPaperworkBlockReason | null,
  referenceMs: number,
) {
  const primary = resolveCandidateRowPrimaryAction({
    candidate: row,
    actingRecruiter,
    sendBlockReason,
    sendBusy: false,
  });

  return {
    candidate: row,
    candidateName: candidateName(row),
    projectLabel: projectLabel(row),
    statusLabel: row.workflowStatus,
    recommendedAction: primary.label,
    reason: deriveRecruiterNextAction(row, referenceMs),
    primaryActionKind: primary.kind,
    primaryActionLabel: primary.label,
  };
}

export function resolveGuidedWorkflowQuickActions(input: {
  candidate: ScoredCandidateWorkflowRow;
  actingRecruiter: string;
  sendBlockReason: SendPaperworkBlockReason | null;
}): GuidedWorkflowQuickAction[] {
  const { candidate, actingRecruiter, sendBlockReason } = input;
  const actions: GuidedWorkflowQuickAction[] = [];
  const primary = resolveCandidateRowPrimaryAction({
    candidate,
    actingRecruiter,
    sendBlockReason,
    sendBusy: false,
  });

  const add = (id: GuidedWorkflowQuickActionId, label: string, disabled?: boolean, title?: string) => {
    actions.push({ id, label, disabled, title });
  };

  if (primary.kind === "send-packet" || candidate.workflowStatus === "Paperwork Needed") {
    add("send-packet", "Send Packet", primary.kind === "send-packet" && primary.disabled);
  }
  if (candidate.dmNeedsAssignment || candidate.assignedDM === "Unassigned") {
    add("assign-dm", candidate.suggestedDM ? `Assign ${candidate.suggestedDM}` : "Assign DM");
  }
  if (candidate.workflowStatus === "Signed" || isMelReadyStatus(candidate.workflowStatus)) {
    add("ready-for-mel", "Ready For MEL");
  }
  if (candidate.recruitingActions.needsFollowUp) {
    add("follow-up-complete", "Follow-Up Complete");
  }
  if (!candidate.recruitingActions.priorityList) {
    add("escalate", "Escalate");
  }
  if (candidate.assignedRecruiter.trim() !== actingRecruiter.trim()) {
    add("assign-me", "Assign Me");
  }

  return actions;
}

export function buildGuidedRecruitingSnapshot(
  input: BuildGuidedRecruitingInput & {
    sendBlockReason?: SendPaperworkBlockReason | null;
    recruiters?: string[];
  },
): GuidedRecruitingSnapshot {
  const referenceMs = input.referenceMs ?? Date.now();
  const sendBlockReason = input.sendBlockReason ?? null;
  const nextRow = pickWorkNextCandidate(input.candidates, input.actingRecruiter, {
    referenceMs,
    skippedCandidateIds: input.skippedCandidateIds,
  });

  const recruiters =
    input.recruiters ??
    [...new Set(input.candidates.map((row) => row.assignedRecruiter.trim()).filter(Boolean))];

  return {
    actingRecruiter: input.actingRecruiter,
    generatedAt: new Date(referenceMs).toISOString(),
    nextBestAction: nextRow
      ? buildNextBestActionCard(nextRow, input.actingRecruiter, sendBlockReason, referenceMs)
      : null,
    followUpQueue: buildFollowUpQueue(input.candidates, input.actingRecruiter, referenceMs),
    productivityToday: countProductivityToday(input.candidates, input.actingRecruiter, referenceMs),
    inbox: buildInbox(input.candidates, input.actingRecruiter, referenceMs),
    recentActionHistory: buildActionHistory(input.candidates, input.actingRecruiter),
    teamLeaderRows: buildTeamLeaderRows(input.candidates, recruiters, referenceMs),
    scoreboard: buildScoreboard(input.candidates, input.actingRecruiter, referenceMs),
  };
}

export function formatWorkflowStatusLabel(status: CandidateWorkflowStatus): string {
  return status.replace(/([A-Z])/g, " $1").trim();
}
