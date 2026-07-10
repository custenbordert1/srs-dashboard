import { createHash, randomUUID } from "node:crypto";

export const P185_3_SOURCE_PHASE = "P185.3";
export const P185_3_OPERATOR = "P185.3 Controlled Live Rollout";

export type P1853RolloutPhase =
  | "awaiting_configuration"
  | "awaiting_canary"
  | "canary_running"
  | "canary_paused"
  | "canary_passed"
  | "canary_passed_awaiting_backlog"
  | "canary_failed_paused"
  | "backlog_releasing"
  | "backlog_complete"
  | "rollout_blocked";

export type P1853CohortMember = {
  candidateId: string;
  resolvedPositionId: string | null;
  normalizedWorkflowStatus: "Paperwork Needed";
  evidenceRefs: string[];
  templateKey: string;
  emailHash: string;
  idempotencyKey: string;
  queueTimestamp: string;
  cohortId: string;
  approvalTimestamp: string;
  blockedReason: string | null;
  removed: boolean;
};

export type P1853SendAttempt = {
  candidateId: string;
  cycle: "canary" | "backlog";
  attemptedAt: string;
  ok: boolean;
  envelopeIdHash: string | null;
  state:
    | "prepared"
    | "send_requested"
    | "sent_unverified"
    | "confirmed_sent"
    | "failed"
    | "blocked"
    | "unknown";
  error: string | null;
  permanent: boolean;
  transient: boolean;
};

export type P1853FrozenCohort = {
  rolloutId: string;
  cohortId: string;
  frozenAt: string;
  approvedCount: number;
  members: P1853CohortMember[];
  immutable: true;
};

export type P1853GateStatus = {
  cronSecretConfigured: boolean;
  productionAutomationEnabled: boolean;
  durableStorageHealthy: boolean;
  durableStorageNotTmp: boolean;
  dropboxSignConfigured: boolean;
  templateConfigured: boolean;
  p184EnabledForLive: boolean;
  p184ModeLive: boolean;
  killSwitchInactive: boolean;
  circuitBreakerClosed: boolean;
  leaseAvailable: boolean;
  canaryAuthorized: boolean;
  productionStorageConfirmed: boolean;
};

export type P1853RolloutStateFile = {
  schemaVersion: 1;
  updatedAt: string;
  phase: P1853RolloutPhase;
  cohort: P1853FrozenCohort | null;
  canary: {
    maxSends: number;
    concurrent: number;
    attempted: number;
    confirmed: number;
    failed: number;
    sentUnverified: number;
    passed: boolean;
    paused: boolean;
    attempts: P1853SendAttempt[];
  };
  backlog: {
    cycle: number;
    attempted: number;
    confirmed: number;
    failed: number;
    sentUnverified: number;
    remaining: number;
  };
  totals: {
    packetsSent: number;
    packetsConfirmed: number;
    sentUnverified: number;
    failed: number;
    duplicatesPrevented: number;
    newlyBlocked: number;
  };
  lastDryRun: {
    at: string;
    frozenSize: number;
    stillEligible: number;
    newlyBlocked: number;
    queueDepth: number;
  } | null;
  killSwitch: boolean;
  circuitOpen: boolean;
  nextScheduledAction: string | null;
};

export type P1853ReadinessReport = {
  phase: typeof P185_3_SOURCE_PHASE;
  generatedAt: string;
  rolloutId: string | null;
  frozenCohortCount: number;
  dryRun: P1853RolloutStateFile["lastDryRun"];
  gates: P1853GateStatus;
  liveReady: boolean;
  canaryMayExecute: boolean;
  blockers: string[];
  setupInstructions: string[];
  rolloutPhase: P1853RolloutPhase;
  warnings: string[];
};

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function hashEnvelopeId(envelopeId: string): string {
  return createHash("sha256").update(envelopeId).digest("hex").slice(0, 12);
}

export function newRolloutIds(): { rolloutId: string; cohortId: string } {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return {
    rolloutId: `p1853-${stamp}-${randomUUID().slice(0, 8)}`,
    cohortId: `cohort-${stamp}-${randomUUID().slice(0, 8)}`,
  };
}

export function emptyP1853State(): P1853RolloutStateFile {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    phase: "awaiting_configuration",
    cohort: null,
    canary: {
      maxSends: 5,
      concurrent: 1,
      attempted: 0,
      confirmed: 0,
      failed: 0,
      sentUnverified: 0,
      passed: false,
      paused: false,
      attempts: [],
    },
    backlog: {
      cycle: 0,
      attempted: 0,
      confirmed: 0,
      failed: 0,
      sentUnverified: 0,
      remaining: 0,
    },
    totals: {
      packetsSent: 0,
      packetsConfirmed: 0,
      sentUnverified: 0,
      failed: 0,
      duplicatesPrevented: 0,
      newlyBlocked: 0,
    },
    lastDryRun: null,
    killSwitch: false,
    circuitOpen: false,
    nextScheduledAction: null,
  };
}
