export const P160_SOURCE_PHASE = "P160";

export type P160ReadinessLevel = "ready" | "warning" | "blocked";

export type P160Recommendation =
  | "ready_for_server_deployment"
  | "ready_for_observation_mode"
  | "ready_for_controlled_production"
  | "not_ready";

export type P160RiskSeverity = "critical" | "high" | "medium" | "low";

export type P160CheckItem = {
  id: string;
  label: string;
  status: P160ReadinessLevel;
  detail: string;
};

export type P160InfrastructureSection = {
  buildStatus: P160ReadinessLevel;
  buildDetail: string;
  nodeVersion: string;
  nodeCompatible: boolean;
  serverCompatibility: string;
  runtimeHealth: P160ReadinessLevel;
  environmentVariables: P160CheckItem[];
  secretsConfigured: P160CheckItem[];
};

export type P160IntegrationsSection = {
  overall: P160ReadinessLevel;
  items: P160CheckItem[];
};

export type P160AutomationPhase = {
  phase: string;
  label: string;
  status: P160ReadinessLevel;
  detail: string;
  components?: string[];
};

export type P160AutomationReadinessSection = {
  overall: P160ReadinessLevel;
  phases: P160AutomationPhase[];
};

export type P160SafetyChecklistSection = {
  overall: P160ReadinessLevel;
  items: P160CheckItem[];
};

export type P160DeploymentChecklistItem = {
  id: string;
  step: string;
  status: "complete" | "partial" | "pending";
  detail: string;
};

export type P160DeploymentChecklistSection = {
  overall: P160ReadinessLevel;
  items: P160DeploymentChecklistItem[];
};

export type P160RiskItem = {
  id: string;
  severity: P160RiskSeverity;
  title: string;
  detail: string;
  mitigation: string;
};

export type P160RiskAssessmentSection = {
  critical: P160RiskItem[];
  high: P160RiskItem[];
  medium: P160RiskItem[];
  low: P160RiskItem[];
};

export type P160ProductionReadinessReport = {
  sourcePhase: typeof P160_SOURCE_PHASE;
  generatedAt: string;
  overallReadinessScore: number;
  recommendation: P160Recommendation;
  recommendationDetail: string;
  infrastructure: P160InfrastructureSection;
  integrations: P160IntegrationsSection;
  automation: P160AutomationReadinessSection;
  safety: P160SafetyChecklistSection;
  deployment: P160DeploymentChecklistSection;
  risks: P160RiskAssessmentSection;
  validation: {
    readOnly: true;
    continuousModeEnabled: boolean;
    daemonRunning: boolean;
    noLiveActionsPerformed: true;
  };
};
