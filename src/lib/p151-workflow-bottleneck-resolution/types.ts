export const P151_5_SOURCE_PHASE = "P151.5";

export type WorkflowGateId =
  | "requireApproval"
  | "workflowStatus"
  | "dmNeedsAssignment"
  | "resumeRequirement";

export type WorkflowGateAssessment = {
  gateId: WorkflowGateId;
  label: string;
  businessPurpose: string;
  currentImplementation: string;
  required: boolean;
  canAutomate: boolean;
  recommendedImplementation: string;
  risk: string;
  classification: "business_requirement" | "artificial_bottleneck" | "safety_gate";
};

export type CandidatePipelineStage = {
  candidateId: string;
  candidateName: string;
  paperworkNeeded: boolean;
  readyForPaperwork: boolean;
  sendPaperwork: boolean;
  workflowStatus: string;
  p144NextAction: string;
  p145Decision: string;
  p147Decision: string;
  primaryBlocker: string | null;
};

export type BottleneckResolutionReport = {
  sourcePhase: typeof P151_5_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  mechanicalStepsApplied: boolean;
  gateAssessments: WorkflowGateAssessment[];
  before: {
    paperworkNeeded: number;
    readyForPaperwork: number;
    sendPaperwork: number;
    candidates: CandidatePipelineStage[];
  };
  afterMechanicalResolution: {
    paperworkNeeded: number;
    readyForPaperwork: number;
    sendPaperwork: number;
    candidates: CandidatePipelineStage[];
  };
  assignedCandidateIds: string[];
  automationRecommendation: string;
};
