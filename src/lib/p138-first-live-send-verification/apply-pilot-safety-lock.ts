import { pauseScheduler } from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-controls";
import {
  defaultEnvLockdown,
  loadPilotSafetyLockState,
  savePilotSafetyLockState,
  type PilotSafetyLockState,
} from "@/lib/p138-first-live-send-verification/pilot-safety-lock-store";

export async function applyPilotSafetyLock(input: {
  candidateId: string;
  signatureRequestId: string | null;
}): Promise<PilotSafetyLockState> {
  const existing = await loadPilotSafetyLockState();
  if (existing?.pilotComplete && existing.lockedCandidateId === input.candidateId) {
    return existing;
  }

  const lockedAt = new Date().toISOString();
  const state: PilotSafetyLockState = {
    version: 1,
    pilotComplete: true,
    lockedAt,
    lockedCandidateId: input.candidateId,
    signatureRequestId: input.signatureRequestId,
    livePilotDisabled: true,
    operatorGoCleared: true,
    allowlistCleared: true,
    executeOneBlocked: true,
    requiredEnvLockdown: defaultEnvLockdown(),
    updatedAt: lockedAt,
  };

  await savePilotSafetyLockState(state);

  try {
    await pauseScheduler();
  } catch {
    // Scheduler pause is best-effort — lock state is authoritative.
  }

  return state;
}

export async function isExecuteOneBlockedByPilotLock(candidateId?: string): Promise<boolean> {
  const state = await loadPilotSafetyLockState();
  if (!state?.executeOneBlocked) return false;
  if (!candidateId) return true;
  return state.lockedCandidateId === candidateId || state.pilotComplete;
}
