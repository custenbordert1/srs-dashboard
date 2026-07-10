export const P158_SOURCE_PHASE = "P158" as const;

export type P158AssignmentStatus = "queued" | "skipped" | "manual_review" | "blocked";

export type P158AssignmentQueueItem = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  state: string | null;
  territory: string | null;
  dm: string | null;
  position: string;
  assignedRecruiter: string;
  recommendedRecruiter: string | null;
  confidence: number;
  priorityScore: number;
  openDemand: number;
  recruiterWorkload: number;
  status: P158AssignmentStatus;
  reasoning: string[];
  skipReason: string | null;
  duplicateRisk: boolean;
};

export type P158RecruiterWorkloadRow = {
  recruiter: string;
  currentLoad: number;
  projectedLoad: number;
  queuedAssignments: number;
};

export type P158TerritoryBalanceRow = {
  territory: string;
  dm: string | null;
  unassignedCandidates: number;
  openDemand: number;
  recommendedRecruiter: string | null;
};

export type P158AssignmentAuditEvent = {
  id: string;
  at: string;
  candidateId: string;
  candidateName: string;
  action: "simulated" | "assigned" | "skipped" | "blocked" | "failed" | "rolled_back";
  recruiter: string | null;
  confidence: number;
  reason: string;
  executionMode: "simulation" | "production";
  beforeRecruiter: string | null;
  afterRecruiter: string | null;
  rollbackId: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type P158AssignmentDashboard = {
  generatedAt: string;
  readOnly: true;
  sourcePhase: typeof P158_SOURCE_PHASE;
  simulationMode: boolean;
  productionEnabled: boolean;
  summary: {
    totalEvaluated: number;
    assignmentQueue: number;
    highConfidence: number;
    manualReview: number;
    skippedExisting: number;
    blocked: number;
    todaysAssignments: number;
    avgConfidence: number;
  };
  sections: {
    assignmentQueue: P158AssignmentQueueItem[];
    highConfidence: P158AssignmentQueueItem[];
    manualReview: P158AssignmentQueueItem[];
    recruiterWorkload: P158RecruiterWorkloadRow[];
    territoryBalance: P158TerritoryBalanceRow[];
    assignmentHistory: P158AssignmentAuditEvent[];
    todaysAssignments: P158AssignmentAuditEvent[];
    assignmentAudit: P158AssignmentAuditEvent[];
  };
  warnings: string[];
  transitionReport?: import("@/lib/p158-post-assignment-workflow-transition/types").P1583TransitionReport | null;
};

export type P158RunResult = {
  ok: boolean;
  dryRun: boolean;
  message: string;
  assignmentsCompleted: number;
  assignmentsSkipped: number;
  assignmentsBlocked: number;
  assignmentsFailed: number;
  auditEvents: P158AssignmentAuditEvent[];
  dashboard: P158AssignmentDashboard;
  transition?: import("@/lib/p158-post-assignment-workflow-transition/types").P1583TransitionRunResult;
};
