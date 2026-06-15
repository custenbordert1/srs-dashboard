import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateRowPrimaryActionKind } from "@/lib/candidate-row-primary-action";
import type { QueueCandidateRow } from "@/lib/candidate-action-queue";

export type RecruiterHomeMode = "dashboard" | "work";

export type WorkNextTierId =
  | "ready-mel"
  | "paperwork-pending"
  | "follow-up-due"
  | "unassigned"
  | "aging";

export type RecruiterInboxReasonId =
  | "new-applicant"
  | "paperwork-waiting"
  | "ready-for-mel"
  | "dm-request"
  | "escalation";

export type GuidedWorkflowQuickActionId =
  | "send-packet"
  | "assign-dm"
  | "ready-for-mel"
  | "follow-up-complete"
  | "escalate"
  | "assign-me";

export type GuidedWorkflowQuickAction = {
  id: GuidedWorkflowQuickActionId;
  label: string;
  disabled?: boolean;
  title?: string;
};

export type NextBestActionCard = {
  candidate: QueueCandidateRow;
  candidateName: string;
  projectLabel: string;
  statusLabel: string;
  recommendedAction: string;
  reason: string;
  primaryActionKind: CandidateRowPrimaryActionKind;
  primaryActionLabel: string;
};

export type RecruiterProductivityToday = {
  candidatesWorked: number;
  followUpsCompleted: number;
  paperworkSent: number;
  readyForMel: number;
  newAssignments: number;
  goals: {
    candidatesWorked: number;
    followUpsCompleted: number;
    paperworkSent: number;
    readyForMel: number;
  };
};

export type SmartFollowUpQueue = {
  today: number;
  tomorrow: number;
  overdue: number;
};

export type RecruiterInboxItem = {
  candidateId: string;
  candidateName: string;
  projectLabel: string;
  reasonId: RecruiterInboxReasonId;
  reasonLabel: string;
  recommendedAction: string;
  priorityScore: number;
  overdue: boolean;
};

export type CandidateActionHistoryEntry = {
  candidateId: string;
  candidateName: string;
  actorLabel: string;
  actionLabel: string;
  occurredAt: string;
};

export type TeamLeaderRecruiterRow = {
  recruiterName: string;
  assignedOpen: number;
  candidatesWorkedToday: number;
  openActions: number;
  paperworkAging: number;
  melReadyBacklog: number;
  productivityScore: number;
};

export type DailyRecruitingScoreboardPeriod = {
  label: string;
  candidatesWorked: number;
  paperworkSent: number;
  readyForMel: number;
  placements: number;
};

export type DailyRecruitingScoreboard = {
  today: DailyRecruitingScoreboardPeriod;
  week: DailyRecruitingScoreboardPeriod;
  month: DailyRecruitingScoreboardPeriod;
};

export type GuidedRecruitingSnapshot = {
  actingRecruiter: string;
  generatedAt: string;
  nextBestAction: NextBestActionCard | null;
  followUpQueue: SmartFollowUpQueue;
  productivityToday: RecruiterProductivityToday;
  inbox: RecruiterInboxItem[];
  recentActionHistory: CandidateActionHistoryEntry[];
  teamLeaderRows: TeamLeaderRecruiterRow[];
  scoreboard: DailyRecruitingScoreboard;
};

export type BuildGuidedRecruitingInput = {
  candidates: ScoredCandidateWorkflowRow[];
  actingRecruiter: string;
  referenceMs?: number;
  skippedCandidateIds?: string[];
};
