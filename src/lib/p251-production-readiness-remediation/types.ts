import type { ProductionConfigValidation } from "@/lib/production-mail-config";

export const P251_PHASE = "P251-production-readiness-remediation";
export const P251_OPS_DATE = "2026-07-23";

export type P251RecoveryTask = {
  id: string;
  action: "resend" | "reconcile" | "retry" | "manual_review" | "duplicate_cleanup";
  priority: "P0" | "P1" | "P2";
  title: string;
  count: number | null;
  detail: string;
  command: string | null;
  blockedByMail: boolean;
};

export type P251RecoveryTasks = {
  phase: typeof P251_PHASE;
  generatedAt: string;
  opsDate: typeof P251_OPS_DATE;
  mode: "read_only";
  tasks: P251RecoveryTask[];
  sourceArtifacts: string[];
};

export type P251LaunchValidation = {
  phase: typeof P251_PHASE;
  generatedAt: string;
  opsDate: typeof P251_OPS_DATE;
  mode: "zero_write_simulation";
  zeroWritesConfirmed: true;
  liveEmailsSent: 0;
  dropboxWrites: 0;
  melWrites: 0;
  breezyWrites: 0;
  mailReady: boolean;
  resendReady: boolean;
  launchSequenceSimulated: string[];
  volumes: {
    initialPaperworkSends: number;
    reminder1Sends: number;
    readyForMel: number;
    openStoreSafeCapacity: number | null;
  };
  reusedDryRun: boolean;
  readinessOverall: "PASS" | "FAIL" | "WARN";
  notes: string[];
  warnings: string[];
};

export type P251GoNoGo = {
  phase: typeof P251_PHASE;
  generatedAt: string;
  opsDate: typeof P251_OPS_DATE;
  decision: "GO" | "NO-GO" | "CONDITIONAL-GO";
  remainingBlockers: string[];
  configurationChangesRequired: string[];
  codeChangesRequired: string[];
  expectedThroughput: {
    initialPaperworkSends: number;
    reminder1Sends: number;
    openStoreSafeCapacity: number | null;
  };
  estimatedReadyForMelToday: number;
  expectedRecruiterTimeSavingsHours: number;
  highestImpactBlocker: string | null;
  justification: string;
  codeRemediationApplied: string[];
};

export type P251MissionResult = {
  productionConfig: ProductionConfigValidation;
  recovery: P251RecoveryTasks;
  launchValidation: P251LaunchValidation;
  goNoGo: P251GoNoGo;
  artifacts: string[];
};
