import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import type { UserRole } from "@/lib/auth/types";

export type CandidatePriorityBand = "work-immediately" | "high" | "normal" | "monitor";

export type ActionCenterQueueSection = "work-now" | "work-today" | "work-this-week" | "monitor";

export type NextBestActionType =
  | "call"
  | "text"
  | "send-paperwork"
  | "follow-up-paperwork"
  | "ready-for-mel"
  | "assign-dm"
  | "schedule-follow-up"
  | "re-engage"
  | "close";

export type RecruiterOneClickActionId =
  | "assign-me"
  | "contacted"
  | "send-paperwork"
  | "follow-up-complete"
  | "ready-for-mel"
  | "schedule-follow-up"
  | "close-candidate"
  | "escalate";

export type BottleneckBadgeId =
  | "no-touch-24h"
  | "no-touch-48h"
  | "paperwork-pending-48h"
  | "interview-too-long"
  | "ready-mel-not-submitted"
  | "assigned-not-worked"
  | "follow-up-overdue";

export type SmartFilterId =
  | "work-now"
  | "overdue"
  | "paperwork"
  | "ready-for-mel"
  | "interview-follow-up"
  | "no-touch-24h"
  | "no-touch-48h"
  | "assigned-to-me"
  | "unassigned"
  | "high-priority";

export type RecruiterScoreLevel = "excellent" | "good" | "needs-attention" | "at-risk";

export type ActionCenterCandidateRow = {
  candidateId: string;
  candidateName: string;
  locationLabel: string;
  projectLabel: string;
  jobLabel: string;
  workflowStatus: string;
  priorityScore: number;
  priorityBand: CandidatePriorityBand;
  queueSection: ActionCenterQueueSection;
  nextAction: NextBestActionType;
  nextActionLabel: string;
  reason: string;
  expectedImpact: string;
  relatedNeed: string;
  dueDate: string | null;
  lastActivityAt: string | null;
  assignedRecruiter: string;
  bottlenecks: BottleneckBadgeId[];
  oneClickActions: RecruiterOneClickActionId[];
  sourceRow: ScoredCandidateWorkflowRow;
};

export type ProductivityPeriodKpis = {
  candidatesWorked: number;
  followUpsCompleted: number;
  paperworkSent: number;
  readyForMel: number;
  placementsInfluenced: number;
};

export type RecruiterProductivityDashboard = {
  today: ProductivityPeriodKpis;
  week: ProductivityPeriodKpis;
  month: ProductivityPeriodKpis;
};

export type RecruiterScorecard = {
  level: RecruiterScoreLevel;
  score: number;
  label: string;
  drivers: string[];
};

export type TeamLeaderRecruiterView = {
  recruiterName: string;
  assigned: number;
  workedToday: number;
  openFollowUps: number;
  overdueFollowUps: number;
  paperworkAging: number;
  readyForMelBacklog: number;
  productivityScore: number;
  productivityLevel: RecruiterScoreLevel;
  highlight: "top-performer" | "needs-support" | "stalled-queue" | null;
};

export type RecruiterActionCenterScope = {
  recruiterName: string;
  recruiterLabel: string;
  territoryStates: string[];
  role: UserRole;
  scopedToRecruiter: boolean;
  showTeamLeaderView: boolean;
};

export type RecruiterActionCenterSnapshot = {
  generatedAt: string;
  scope: RecruiterActionCenterScope;
  actingRecruiter: string;
  queues: Record<ActionCenterQueueSection, ActionCenterCandidateRow[]>;
  allCandidates: ActionCenterCandidateRow[];
  productivity: RecruiterProductivityDashboard;
  recruiterScore: RecruiterScorecard;
  teamLeaderView: TeamLeaderRecruiterView[];
  activeFilter: SmartFilterId | null;
  workMode: {
    nextCandidate: ActionCenterCandidateRow | null;
    progressToday: number;
    goalToday: number;
    skippedCandidateIds: string[];
  };
};

export type OneClickWorkflowUpdate = {
  candidateId: string;
  queuePayload?: CandidateQueueActionPayload;
  recruitingAction?: { type: "priority-list" | "needs-follow-up"; enabled?: boolean };
  workflowStatus?: string;
  assignedRecruiter?: string;
  note?: string;
};
