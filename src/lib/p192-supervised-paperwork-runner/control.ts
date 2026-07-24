import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  P192_CONTROL_FILE,
  P192_LOCK_FILE,
  P192_STATUS_FILE,
  P192_STOP_FILE,
  type P192RunnerStatus,
} from "@/lib/p192-supervised-paperwork-runner/types";

function dataPath(name: string): string {
  return path.join(recruitingDataDir(), name);
}

export async function writeP192Status(status: P192RunnerStatus): Promise<void> {
  await safeRecruitingMkdir(recruitingDataDir());
  const target = dataPath(P192_STATUS_FILE);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

export async function readP192Status(): Promise<P192RunnerStatus | null> {
  try {
    const raw = await readFile(dataPath(P192_STATUS_FILE), "utf8");
    return JSON.parse(raw) as P192RunnerStatus;
  } catch {
    return null;
  }
}

export type P192LockInfo = {
  pid: number;
  ownerId: string;
  acquiredAt: string;
};

export async function acquireP192ProcessLock(ownerId: string): Promise<
  | { ok: true; lock: P192LockInfo }
  | { ok: false; reason: string; existing: P192LockInfo | null }
> {
  await safeRecruitingMkdir(recruitingDataDir());
  const lockPath = dataPath(P192_LOCK_FILE);
  try {
    const existing = JSON.parse(await readFile(lockPath, "utf8")) as P192LockInfo;
    if (existing.pid && isPidAlive(existing.pid)) {
      return {
        ok: false,
        reason: `Another healthy runner owns the lock (pid=${existing.pid}).`,
        existing,
      };
    }
  } catch {
    // no lock
  }

  const lock: P192LockInfo = {
    pid: process.pid,
    ownerId,
    acquiredAt: new Date().toISOString(),
  };
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return { ok: true, lock };
}

export async function releaseP192ProcessLock(ownerId: string): Promise<void> {
  const lockPath = dataPath(P192_LOCK_FILE);
  try {
    const existing = JSON.parse(await readFile(lockPath, "utf8")) as P192LockInfo;
    if (existing.ownerId !== ownerId && existing.pid !== process.pid) return;
    await unlink(lockPath);
  } catch {
    // already gone
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function requestP192Stop(): Promise<void> {
  await safeRecruitingMkdir(recruitingDataDir());
  await writeFile(
    dataPath(P192_STOP_FILE),
    `${JSON.stringify({ requestedAt: new Date().toISOString(), by: "operator" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    dataPath(P192_CONTROL_FILE),
    `${JSON.stringify({ stopRequested: true, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

export async function clearP192StopRequest(): Promise<void> {
  try {
    await unlink(dataPath(P192_STOP_FILE));
  } catch {
    // ok
  }
  try {
    await writeFile(
      dataPath(P192_CONTROL_FILE),
      `${JSON.stringify({ stopRequested: false, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // ok
  }
}

export async function isP192StopRequested(): Promise<boolean> {
  try {
    await access(dataPath(P192_STOP_FILE));
    return true;
  } catch {
    // fall through
  }
  try {
    const raw = await readFile(dataPath(P192_CONTROL_FILE), "utf8");
    const parsed = JSON.parse(raw) as { stopRequested?: boolean };
    return Boolean(parsed.stopRequested);
  } catch {
    return false;
  }
}
