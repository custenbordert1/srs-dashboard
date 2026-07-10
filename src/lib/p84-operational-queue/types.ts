export const P90_SOURCE_PHASE = "P90";
export const P90_PREVIEW_MODE = true as const;

export type OperationalQueueStatus =
  | "ready_to_fix"
  | "needs_job_publish"
  | "needs_recruiter_assignment"
  | "needs_dm_assignment"
  | "needs_p83_advancement"
  | "ready_for_p84_preview"
  | "monitor_only"
  | "blocked";

export const OPERATIONAL_QUEUE_STATUS_LABELS: Record<OperationalQueueStatus, string> = {
  ready_to_fix: "Ready to Fix",
  needs_job_publish: "Needs Job Publish",
  needs_recruiter_assignment: "Needs Recruiter Assignment",
  needs_dm_assignment: "Needs DM Assignment",
  needs_p83_advancement: "Needs P83 Advancement",
  ready_for_p84_preview: "Ready for P84 Preview",
  monitor_only: "Monitor Only",
  blocked: "Blocked",
};

export type OperationalActionStepId =
  | "publish_job"
  | "assign_recruiter"
  | "assign_dm"
  | "p83_advancement"
  | "recheck_p84";

export type OperationalRiskLevel = "low" | "medium" | "high";

export type OperationalActionStep = {
  stepId: OperationalActionStepId;
  stepNumber: number;
  stepLabel: string;
  candidateId: string;
  candidateName: string;
  positionId: string;
  positionName: string;
  dmTerritory: string;
  recommendedOwner: string;
  currentBlocker: string;
  requiredAction: string;
  expectedResult: string;
  riskLevel: OperationalRiskLevel;
  manualApprovalRequired: boolean;
  completed: boolean;
  pending: boolean;
};

export type OperationalQueueEntry = {
  candidateId: string;
  candidateName: string;
  breezyCandidateId: string;
  positionId: string;
  positionName: string;
  dmTerritory: string;
  suggestedDm: string;
  recommendedRecruiter: string;
  currentBlocker: string;
  queueStatus: OperationalQueueStatus;
  queueStatusLabel: string;
  grade: string;
  steps: OperationalActionStep[];
  nextAction: OperationalActionStep | null;
  canEnterSendQueue: boolean;
};

export type PaperworkUnlockQueueMetrics = {
  totalUnlockable: number;
  needsJobPublish: number;
  needsRecruiterAssignment: number;
  needsDmAssignment: number;
  needsP83Advancement: number;
  readyForP84Preview: number;
  monitorOnly: number;
  blocked: number;
  readyToFix: number;
  currentP84Eligible: number;
};

export type P84OperationalQueueReport = {
  sourcePhase: typeof P90_SOURCE_PHASE;
  previewMode: typeof P90_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "Paperwork Unlock Queue";
  metrics: PaperworkUnlockQueueMetrics;
  entries: OperationalQueueEntry[];
  unlockable: OperationalQueueEntry[];
  monitorOnly: OperationalQueueEntry[];
  blocked: OperationalQueueEntry[];
  readyForP84Preview: OperationalQueueEntry[];
  operationalOrder: string[];
  remainingBlockersBeforeLiveSend: string[];
};
