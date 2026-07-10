import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type {
  AutopilotDashboardMetrics,
  AutopilotEnabledFeatures,
  AutopilotState,
} from "@/lib/p154-controlled-production-autopilot-activation/types";
import {
  P154_DEFAULT_MAX_ASSIGNMENTS,
  P154_DEFAULT_MAX_SENDS,
} from "@/lib/p154-controlled-production-autopilot-activation/types";

const VERSION = "P154.1";

function statePath(): string {
  return path.join(recruitingDataDir(), "p154-controlled-production-autopilot-state.json");
}

function emptyDashboard(): AutopilotDashboardMetrics {
  return {
    candidatesEvaluated: 0,
    recruitersAssigned: 0,
    paperworkSent: 0,
    paperworkCompleted: 0,
    paperworkSkipped: 0,
    duplicatesPrevented: 0,
    failures: 0,
    webhookCompletions: 0,
    averageProcessingTimeMs: 0,
    queueDepth: 0,
    lastSuccessfulCycleAt: null,
  };
}

export function defaultAutopilotEnabledFeatures(): AutopilotEnabledFeatures {
  return {
    p151RecruiterAssignment: true,
    p152ImmediatePaperwork: true,
    freshIngestionRescue: true,
    automaticWorkflowAdvancement: true,
    webhookCompletionProcessing: true,
    duplicatePrevention: true,
    continuousIngestion: true,
  };
}

export function defaultAutopilotState(): AutopilotState {
  return {
    version: VERSION,
    autopilotStatus: "stopped",
    paused: false,
    pausedReason: null,
    enabledFeatures: defaultAutopilotEnabledFeatures(),
    limits: {
      maxRecruiterAssignmentsPerCycle: P154_DEFAULT_MAX_ASSIGNMENTS,
      maxPaperworkSendsPerCycle: P154_DEFAULT_MAX_SENDS,
    },
    dashboard: emptyDashboard(),
    lastCycleAt: null,
    lastSuccessfulCycleAt: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadAutopilotState(): Promise<AutopilotState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as AutopilotState;
    return { ...defaultAutopilotState(), ...parsed, version: VERSION };
  } catch {
    return defaultAutopilotState();
  }
}

export async function saveAutopilotState(state: AutopilotState): Promise<void> {
  await safeRecruitingMkdir();
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
