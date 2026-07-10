import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { P1582OutcomeDiagnosis } from "@/lib/p158-post-assignment-outcome-diagnosis/types";

export const P158_1_SOURCE_PHASE = "P158.1" as const;

export type P1581WorkloadRow = {
  recruiter: string;
  before: number;
  after: number;
  delta: number;
  utilizationPercent: number;
  queuedInSimulation: number;
};

export type P1581TerritoryHeatCell = {
  territory: string;
  dm: string | null;
  openDemand: number;
  unassignedBefore: number;
  unassignedAfter: number;
  assignedInSimulation: number;
  imbalanceScore: number;
};

export type P1581PostAssignmentOutcome = {
  candidateId: string;
  candidateName: string;
  recruiter: string;
  p157Action: string;
  confidence: number;
};

export type P1581ConfidenceBucket = {
  label: string;
  min: number;
  max: number;
  count: number;
};

export type P1581SimulationWarning = {
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
};

export type P1581SimulationSummary = {
  candidatesEvaluated: number;
  candidatesAssignedInSimulation: number;
  candidatesRemainingUnassigned: number;
  largestWorkloadIncrease: { recruiter: string; delta: number } | null;
  territoryImbalanceScore: number;
  avgRecruiterUtilization: number;
  readyForPaperwork: number;
  manualReview: number;
  followUp: number;
  blocked: number;
};

export type P1581AssignmentSimulation = {
  generatedAt: string;
  readOnly: true;
  sourcePhase: typeof P158_1_SOURCE_PHASE;
  simulationOnly: true;
  maxAssignmentsApplied: number | null;
  summary: P1581SimulationSummary;
  sections: {
    assignmentSimulation: P158AssignmentQueueItem[];
    workloadImpact: P1581WorkloadRow[];
    territoryHeatMap: P1581TerritoryHeatCell[];
    beforeAfterComparison: P1581WorkloadRow[];
    projectedPaperworkQueue: P1581PostAssignmentOutcome[];
    warnings: P1581SimulationWarning[];
    simulationSummary: P1581SimulationSummary;
    confidenceDistribution: P1581ConfidenceBucket[];
    postAssignmentDiagnosis: import("@/lib/p158-post-assignment-outcome-diagnosis/types").P1582CandidateDiagnosis[];
  };
  outcomeDiagnosis: P1582OutcomeDiagnosis | null;
  warnings: string[];
};

export type P1581SimulationRunResult = {
  ok: true;
  readOnly: true;
  simulationOnly: true;
  message: string;
  simulation: P1581AssignmentSimulation;
};
