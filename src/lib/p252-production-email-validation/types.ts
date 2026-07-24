import type { ProductionConfigValidation } from "@/lib/production-mail-config";

export const P252_PHASE = "P252-production-email-validation";
export const P252_OPS_DATE = "2026-07-23";

export const P252_INTERNAL_TEST_ENV_VARS = [
  "SRS_INTERNAL_TEST_EMAIL",
  "SRS_OPS_TEST_EMAIL",
  "SRS_PRODUCTION_MAIL_TEST_EMAIL",
] as const;

export const P252_TEST_SUBJECT = "SRS Recruiting Production Validation";

export type P252ResendProbe = {
  attempted: boolean;
  authenticated: boolean | null;
  httpStatus: number | null;
  domain: string | null;
  domainStatus: string | null;
  domainVerified: boolean | null;
  fromAuthorized: boolean | null;
  quotaAvailable: boolean | null;
  quotaDetail: string | null;
  detail: string;
  blockers: string[];
};

export type P252LiveDeliveryValidation = {
  attempted: boolean;
  skippedReason: string | null;
  recipientEnvVar: string | null;
  recipientRedacted: string | null;
  subject: string;
  sent: boolean;
  messageId: string | null;
  provider: "resend" | null;
  error: string | null;
  bodyMeta: {
    timestamp: string;
    environment: string;
    deploymentId: string | null;
    gitCommit: string | null;
    mailProvider: string;
  } | null;
};

export type P252PipelineReadiness = {
  p245MailCanLiveDeliver: boolean;
  p246MailCanLiveDeliver: boolean;
  p249ReadinessOverall: "PASS" | "FAIL" | "WARN" | "unknown";
  p249ResendReady: boolean | null;
  transactionalRequireLiveDeliveryPresent: boolean;
  startupOkForLiveEmail: boolean;
  failFastEnabled: boolean;
  unitTests: {
    attempted: boolean;
    command: string | null;
    passed: boolean | null;
    detail: string;
  };
  notes: string[];
  blockers: string[];
};

export type P252CapacityProjection = {
  initialSendsReady: number;
  remindersReady: number;
  dailyThroughputInitialPerHour: number | null;
  dailyThroughputRemindersPerHour: number | null;
  estimatedMinutesForReminders: number | null;
  estimatedMinutesForInitialSends: number | null;
  projectedCompletionSummary: string;
  recruiterHoursSaved: number;
  readyForMel: number;
  sourceArtifacts: string[];
};

export type P252GoNoGo = {
  phase: typeof P252_PHASE;
  generatedAt: string;
  opsDate: typeof P252_OPS_DATE;
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
  liveTestEmailSent: boolean;
  liveTestEmailRecipientRedacted: string | null;
  justification: string;
};

export type P252ProductionValidation = {
  phase: typeof P252_PHASE;
  generatedAt: string;
  opsDate: typeof P252_OPS_DATE;
  runtimeConfig: ProductionConfigValidation;
  resendProbe: P252ResendProbe;
  liveDelivery: P252LiveDeliveryValidation;
  pipeline: P252PipelineReadiness;
  capacity: P252CapacityProjection;
  goNoGo: P252GoNoGo;
  safety: {
    secretsNeverPrinted: true;
    candidateEmailsNeverTargeted: true;
    paperworkNeverResent: true;
    workflowStagesUnmodified: true;
    dbCandidateUpdates: 0;
    simulatedSuccess: false;
  };
  artifacts: string[];
};
