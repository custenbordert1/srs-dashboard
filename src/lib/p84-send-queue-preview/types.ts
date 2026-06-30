export const P96_SOURCE_PHASE = "P96";
export const P96_PREVIEW_MODE = true as const;

export type ApprovalPersistenceSimulation = {
  simulatedOnly: boolean;
  p62RecruiterApproved: boolean;
  dmAssignmentApproved: boolean;
  p83AdvancementApproved: boolean;
  workflowStatus: "Paperwork Needed";
  actionType: "send-paperwork";
  detail: string;
};

export type SendQueueSafetyGate = {
  id: string;
  label: string;
  passed: boolean;
  detail: string | null;
};

export type P84SendQueueEntry = {
  candidateId: string;
  candidateName: string;
  email: string;
  recruiter: string;
  dm: string;
  jobTitle: string;
  city: string;
  state: string;
  positionId: string;
  approvalPersistence: ApprovalPersistenceSimulation;
  eligibilityResult: "eligible" | "blocked";
  sendBlockedReason: string | null;
  duplicateSendProtection: {
    passed: boolean;
    detail: string | null;
  };
  liveSend: false;
  inSendQueue: boolean;
  safetyGates: SendQueueSafetyGate[];
  executiveApprovalRequired: true;
  autoApproveBlocked: true;
};

export type P84SendQueuePreviewMetrics = {
  approvalPersistedSimulationCount: number;
  p84EligibleCount: number;
  sendQueueCount: number;
  blockedFromSendCount: number;
  duplicateRiskCount: number;
  invalidEmailCount: number;
  liveSendsDisabledCount: number;
};

export type P84SendQueuePreviewReport = {
  sourcePhase: typeof P96_SOURCE_PHASE;
  previewMode: typeof P96_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "P84 Send Queue Preview";
  cohortLabel: string;
  metrics: P84SendQueuePreviewMetrics;
  sendQueue: P84SendQueueEntry[];
  blocked: P84SendQueueEntry[];
  sampleTraces: P84SendQueueEntry[];
  finalChecklistBeforeApprovalModeProduction: string[];
};
