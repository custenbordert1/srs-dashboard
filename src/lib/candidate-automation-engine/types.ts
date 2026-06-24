export type CandidateAutomationMode = "manual" | "semi-automatic" | "automatic";

export type AutomationRunTrigger = "ingestion" | "scheduled" | "manual" | "api" | "client";

export type CandidateAutomationPolicy = {
  mode: CandidateAutomationMode;
  paused: boolean;
  assign: { enabled: boolean };
  actions: { enabled: boolean };
  progression: { enabled: boolean };
  execution: { enabled: boolean };
  escalation: { enabled: boolean };
  rebalance: { enabled: boolean };
  updatedAt: string;
  lastRunAt?: string;
};

export type CandidateAutomationRunRecord = {
  runId: string;
  trigger: AutomationRunTrigger;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  skipped: boolean;
  skipReason?: string;
  mtdCandidatesProcessed: number;
  p62Assigned: number;
  p63ActionsGenerated: number;
  p64ProgressionsGenerated: number;
  p62CoveragePct: number;
  p63CoveragePct: number;
  p64CoveragePct: number;
  candidatesAutoAssigned: number;
  candidatesAutoActioned: number;
  candidatesAutoProgressed: number;
  manualInterventionRequired: number;
  automationCompletionPct: number;
  errors: string[];
  warnings: string[];
};

export type CandidateAutomationRunResult = {
  ok: boolean;
  skipped: boolean;
  skipReason?: string;
  runId: string;
  trigger: AutomationRunTrigger;
  durationMs: number;
  mtdCandidatesProcessed: number;
  p62Assigned: number;
  p63ActionsGenerated: number;
  p64ProgressionsGenerated: number;
  p62CoveragePct: number;
  p63CoveragePct: number;
  p64CoveragePct: number;
  health: CandidateAutomationHealth;
  errors: string[];
  warnings: string[];
};

export type CandidateAutomationHealth = {
  lastRunAt: string | null;
  lastTrigger: AutomationRunTrigger | null;
  lastRunOk: boolean | null;
  policyMode: CandidateAutomationMode;
  policyPaused: boolean;
  runSuccessRatePct: number;
  failedRuns: number;
  totalRuns: number;
  mtdCandidatesProcessed: number;
  p62CoveragePct: number;
  p63CoveragePct: number;
  p64CoveragePct: number;
  candidatesAutoAssigned: number;
  candidatesAutoActioned: number;
  candidatesAutoProgressed: number;
  manualInterventionRequired: number;
  automationCompletionPct: number;
  autoExecutions: number;
  escalations: number;
  rebalances: number;
};
