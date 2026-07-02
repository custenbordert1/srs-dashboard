export const P141_SOURCE_PHASE = "P141";
export const P141_CERTIFICATION_MODE = "auditOnly" as const;

export type CertificationResult = "PASS" | "FAIL";

export type SubsystemCertification = {
  phase: string;
  name: string;
  result: CertificationResult;
  detail: string;
  executeBatchCalled: false;
  goNoGo: string | null;
};

export type SafetyVerification = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type DryRunSimulationSummary = {
  completedAt: string;
  liveModeEnabled: boolean;
  paperworkSent: false;
  executeBatchCalled: false;
  breezyWrites: false;
  pilotCandidateId: string | null;
  p137GoNoGo: string | null;
  p138OverallResult: string | null;
  productionHealthResult: string | null;
  phasesSimulated: string[];
};

export type FinalRecommendation =
  | "NOT READY"
  | "READY WITH CONDITIONS"
  | "READY FOR FIRST LIVE PILOT";

export type ProductionReadinessCertificationReport = {
  sourcePhase: typeof P141_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P141_CERTIFICATION_MODE;
  subsystemCertifications: SubsystemCertification[];
  safetyVerifications: SafetyVerification[];
  dryRunSimulation: DryRunSimulationSummary;
  remainingRisks: string[];
  requiredManualOperatorActions: string[];
  suggestedImprovements: string[];
  productionReadinessScore: number;
  finalRecommendation: FinalRecommendation;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
