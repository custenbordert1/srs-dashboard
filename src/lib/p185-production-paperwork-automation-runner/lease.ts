import { randomUUID } from "node:crypto";
import {
  casUpdateP185RunnerState,
  loadP185RunnerState,
  saveP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import type {
  P185LeaseRecord,
  P185RunnerStateFile,
} from "@/lib/p185-production-paperwork-automation-runner/types";
import { DEFAULT_P185_SAFETY } from "@/lib/p185-production-paperwork-automation-runner/types";

export type P185LeaseAcquireResult =
  | {
      acquired: true;
      lease: P185LeaseRecord;
      state: P185RunnerStateFile;
    }
  | {
      acquired: false;
      reason: string;
      activeLease: P185LeaseRecord | null;
      remainingMs: number | null;
      state: P185RunnerStateFile;
    };

function remainingMs(lease: P185LeaseRecord | null, nowMs: number): number | null {
  if (!lease) return null;
  return Math.max(0, Date.parse(lease.expiresAt) - nowMs);
}

export function isLeaseExpired(lease: P185LeaseRecord | null, nowMs: number): boolean {
  if (!lease) return true;
  return Date.parse(lease.expiresAt) <= nowMs;
}

export async function acquireP185Lease(input?: {
  ownerId?: string;
  cycleId?: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<P185LeaseAcquireResult> {
  const nowMs = input?.nowMs ?? Date.now();
  const ownerId = input?.ownerId ?? `p185-${randomUUID()}`;
  const cycleId = input?.cycleId ?? randomUUID();
  const state = await loadP185RunnerState();
  const ttlMs = input?.ttlMs ?? state.safety.leaseTtlMs ?? DEFAULT_P185_SAFETY.leaseTtlMs;

  if (state.lease && !isLeaseExpired(state.lease, nowMs)) {
    return {
      acquired: false,
      reason: "Lease held by another runner.",
      activeLease: state.lease,
      remainingMs: remainingMs(state.lease, nowMs),
      state,
    };
  }

  const lease: P185LeaseRecord = {
    ownerId,
    cycleId,
    acquiredAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    heartbeatAt: new Date(nowMs).toISOString(),
    version: (state.lease?.version ?? 0) + 1,
  };

  const expectedVersion = state.recordVersion;
  const cas = await casUpdateP185RunnerState(expectedVersion, (draft) => {
    if (draft.lease && !isLeaseExpired(draft.lease, nowMs)) return null;
    draft.lease = lease;
    draft.runnerStatus = "running";
    return draft;
  });

  if (!cas || cas.lease?.ownerId !== ownerId || cas.lease.cycleId !== cycleId) {
    const latest = await loadP185RunnerState();
    return {
      acquired: false,
      reason: "Compare-and-set lease acquisition lost to concurrent writer.",
      activeLease: latest.lease,
      remainingMs: remainingMs(latest.lease, nowMs),
      state: latest,
    };
  }

  return { acquired: true, lease, state: cas };
}

export async function heartbeatP185Lease(input: {
  ownerId: string;
  cycleId: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<boolean> {
  const nowMs = input.nowMs ?? Date.now();
  const state = await loadP185RunnerState();
  if (!state.lease) return false;
  if (state.lease.ownerId !== input.ownerId || state.lease.cycleId !== input.cycleId) return false;
  const ttlMs = input.ttlMs ?? state.safety.leaseTtlMs ?? DEFAULT_P185_SAFETY.leaseTtlMs;
  state.lease.heartbeatAt = new Date(nowMs).toISOString();
  state.lease.expiresAt = new Date(nowMs + ttlMs).toISOString();
  await saveP185RunnerState(state);
  return true;
}

export async function releaseP185Lease(input: {
  ownerId: string;
  cycleId: string;
}): Promise<P185RunnerStateFile> {
  const state = await loadP185RunnerState();
  if (
    state.lease &&
    state.lease.ownerId === input.ownerId &&
    state.lease.cycleId === input.cycleId
  ) {
    state.lease = null;
    if (state.runnerStatus === "running") {
      state.runnerStatus = state.safety.killSwitch
        ? "killed"
        : state.circuit.open
          ? "circuit_open"
          : state.safety.pauseUntil && Date.parse(state.safety.pauseUntil) > Date.now()
            ? "paused"
            : "idle";
    }
  }
  return saveP185RunnerState(state);
}

export function describeActiveLease(
  state: P185RunnerStateFile,
  nowMs = Date.now(),
): {
  held: boolean;
  ownerId: string | null;
  expiresAt: string | null;
  remainingMs: number | null;
  stale: boolean;
} {
  const lease = state.lease;
  if (!lease) {
    return { held: false, ownerId: null, expiresAt: null, remainingMs: null, stale: false };
  }
  const expired = isLeaseExpired(lease, nowMs);
  return {
    held: !expired,
    ownerId: lease.ownerId,
    expiresAt: lease.expiresAt,
    remainingMs: remainingMs(lease, nowMs),
    stale: expired,
  };
}
