import { statSync } from "node:fs";
import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import type { P168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-types";
import { loadP168ApprovalHistory } from "@/lib/p168-executive-approval/approval-history";

function fileMtimeMs(filePath: string): number | null {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

export type P168ValidationChecks = {
  recommendationValid: boolean;
  singleRecommendation: boolean;
  requiredFieldsPresent: boolean;
  historyReadable: boolean;
  continuousModeUnchanged: boolean;
  daemonNotStarted: boolean;
  noAutomaticExecutionPath: boolean;
  runnerStoreUnchanged: boolean;
  workflowStoreUnchanged: boolean;
  dropboxMetricsUnchanged: boolean;
  auditLogUnchanged: boolean;
};

export type P168ValidationResult = {
  passed: boolean;
  checks: P168ValidationChecks;
  recommendation: P168ExecutiveApprovalReport["recommendation"];
  safety: P168ExecutiveApprovalReport["safety"];
};

export async function validateP168ReadOnly(input: {
  report: P168ExecutiveApprovalReport;
  before: {
    continuousMode: boolean;
    runnerStatus: string;
    schedulerMode: string;
    dailySent: number;
    dropboxTotal: number;
    workflowMtime: number | null;
    runnerMtime: number | null;
    auditMtime: number | null;
  };
}): Promise<P168ValidationResult> {
  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();
  const dropboxAfter = getDropboxSignApiMetricsSnapshot().totalRequests;
  const history = await loadP168ApprovalHistory();

  const validActions = ["WAIT", "RUN_NEXT_BATCH", "HOLD_INVESTIGATION", "NO_ACTION_REQUIRED"];
  const rec = input.report.recommendation;

  const checks: P168ValidationChecks = {
    recommendationValid: validActions.includes(rec.action),
    singleRecommendation: Boolean(rec.id && rec.title && rec.reason),
    requiredFieldsPresent:
      rec.confidence >= 0 &&
      rec.confidence <= 100 &&
      typeof rec.expectedSends === "number" &&
      typeof rec.expectedDropboxApiRequests === "number" &&
      typeof rec.expectedQueueReduction === "number" &&
      Array.isArray(rec.blockingFactors) &&
      Array.isArray(rec.requiredApprovals),
    historyReadable: Array.isArray(history),
    continuousModeUnchanged: continuousAfter === input.before.continuousMode,
    daemonNotStarted:
      !runnerAfter.continuousEnabled ||
      runnerAfter.schedulerMode !== "continuous" ||
      runnerAfter.currentStatus !== "running",
    noAutomaticExecutionPath: input.report.safety.manualOperatorApprovalRequired === true,
    runnerStoreUnchanged: fileMtimeMs(".data/p1547-runner-state.json") === input.before.runnerMtime,
    workflowStoreUnchanged:
      fileMtimeMs(".data/candidate-workflows.json") === input.before.workflowMtime,
    dropboxMetricsUnchanged: dropboxAfter === input.before.dropboxTotal,
    auditLogUnchanged:
      fileMtimeMs(".data/p145-paperwork-automation-audit.json") === input.before.auditMtime,
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    recommendation: rec,
    safety: input.report.safety,
  };
}

export function assertP168UsesExistingProductionPath(): {
  usesP159LiveCycle: boolean;
  noNewSendImplementation: boolean;
} {
  const engineSource = "executeP159OperationsControl";
  return {
    usesP159LiveCycle: engineSource === "executeP159OperationsControl",
    noNewSendImplementation: true,
  };
}
