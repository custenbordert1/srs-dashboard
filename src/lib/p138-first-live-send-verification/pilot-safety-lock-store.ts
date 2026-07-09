import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type { PilotSafetyLockStatus } from "@/lib/p138-first-live-send-verification/types";

export type PilotSafetyLockState = {
  version: 1;
  pilotComplete: boolean;
  lockedAt: string;
  lockedCandidateId: string;
  signatureRequestId: string | null;
  livePilotDisabled: boolean;
  operatorGoCleared: boolean;
  allowlistCleared: boolean;
  executeOneBlocked: boolean;
  requiredEnvLockdown: Record<string, string>;
  updatedAt: string;
};

export function p138PilotSafetyLockPath(): string {
  return path.join(recruitingDataDir(), "p138-pilot-safety-lock-state.json");
}

export function defaultEnvLockdown(): Record<string, string> {
  return {
    AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED: "false",
    AUTONOMOUS_PAPERWORK_LIVE_MODE: "false",
    AUTONOMOUS_PAPERWORK_OPERATOR_GO: "false",
    AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST: "",
    AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS: "1",
  };
}

export async function loadPilotSafetyLockState(): Promise<PilotSafetyLockState | null> {
  try {
    const raw = await readFile(p138PilotSafetyLockPath(), "utf8");
    return JSON.parse(raw) as PilotSafetyLockState;
  } catch {
    return null;
  }
}

export async function savePilotSafetyLockState(state: PilotSafetyLockState): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(p138PilotSafetyLockPath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function toSafetyLockStatus(state: PilotSafetyLockState | null): PilotSafetyLockStatus {
  if (!state) {
    return {
      applied: false,
      pilotComplete: false,
      livePilotDisabled: false,
      operatorGoCleared: false,
      allowlistCleared: false,
      executeOneBlocked: false,
      lockedAt: null,
      lockedCandidateId: null,
      requiredEnvLockdown: defaultEnvLockdown(),
    };
  }

  return {
    applied: true,
    pilotComplete: state.pilotComplete,
    livePilotDisabled: state.livePilotDisabled,
    operatorGoCleared: state.operatorGoCleared,
    allowlistCleared: state.allowlistCleared,
    executeOneBlocked: state.executeOneBlocked,
    lockedAt: state.lockedAt,
    lockedCandidateId: state.lockedCandidateId,
    requiredEnvLockdown: state.requiredEnvLockdown,
  };
}
