export const P97_SOURCE_PHASE = "P97";
export const P97_PREVIEW_MODE = false as const;
export const P97_LIVE_SEND = false as const;

export type ApprovalModeEntryStatus = "pending" | "persisted";

export type WorkflowStateSnapshot = {
  workflowStatus: string;
  actionType: string | null;
  assignedRecruiter: string;
  assignedDM: string;
};

export type ApprovalModeQueueEntry = {
  candidateId: string;
  candidateName: string;
  email: string;
  jobTitle: string;
  city: string;
  state: string;
  recruiter: string;
  dm: string;
  confidence: number;
  riskLevel: string;
  status: ApprovalModeEntryStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  beforeState: WorkflowStateSnapshot | null;
  afterState: WorkflowStateSnapshot | null;
  rollbackAvailable: boolean;
  p84EligibleAfterPersistence: boolean | null;
  liveSend: false;
  manualApprovalRequired: true;
};

export type ApprovalModeProductionMetrics = {
  pendingApprovals: number;
  approved: number;
  persisted: number;
  rollbackAvailable: number;
  p84EligibleAfterPersistence: number;
  liveSendsBlocked: number;
};

export type ApprovalModeProductionReport = {
  sourcePhase: typeof P97_SOURCE_PHASE;
  previewMode: false;
  liveSend: typeof P97_LIVE_SEND;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "Approval Mode Production";
  cohortLabel: string;
  metrics: ApprovalModeProductionMetrics;
  queue: ApprovalModeQueueEntry[];
  sampleTraces: ApprovalModeQueueEntry[];
  auditLogPath: string;
  rollbackArtifactPath: string;
  stateArtifactPath: string;
  remainingBlockersBeforeLivePaperwork: string[];
};

export type ApprovalModePersistResult = {
  ok: true;
  persisted: string[];
  skipped: Array<{ candidateId: string; reason: string }>;
  report: ApprovalModeProductionReport;
};

export type P97PersistedRecord = {
  candidateId: string;
  candidateName: string;
  approvedBy: string;
  approvedByUserId: string;
  approvedAt: string;
  beforeState: WorkflowStateSnapshot;
  afterState: WorkflowStateSnapshot;
  rollbackId: string;
};

export type P97ApprovalModeStateFile = {
  version: 1;
  updatedAt: string;
  persisted: P97PersistedRecord[];
};

export type P97RollbackEntry = {
  rollbackId: string;
  candidateId: string;
  candidateName: string;
  createdAt: string;
  approvedBy: string;
  beforeState: WorkflowStateSnapshot;
  afterState: WorkflowStateSnapshot;
  rollbackPlan: string;
};

export type P97RollbackFile = {
  version: 1;
  updatedAt: string;
  entries: P97RollbackEntry[];
};

export type P97AuditEntry = {
  id: string;
  at: string;
  phase: typeof P97_SOURCE_PHASE;
  action: "approval_persist" | "approval_preview";
  candidateId: string;
  candidateName: string;
  approvedBy: string;
  approvedByUserId: string;
  beforeState: WorkflowStateSnapshot;
  afterState: WorkflowStateSnapshot;
  liveSend: false;
  paperworkSent: false;
};
