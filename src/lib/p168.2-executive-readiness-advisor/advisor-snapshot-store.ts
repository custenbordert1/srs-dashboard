import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { P1682ReadinessSnapshot } from "@/lib/p168.2-executive-readiness-advisor/types";
import { P168_2_SOURCE_PHASE } from "@/lib/p168.2-executive-readiness-advisor/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

const MAX_SNAPSHOTS = 10;

function snapshotPath(): string {
  return path.join(recruitingDataDir(), "p168.2-readiness-advisor-snapshots.json");
}

type SnapshotStore = {
  snapshots: P1682ReadinessSnapshot[];
  updatedAt: string;
};

export async function loadP1682ReadinessSnapshots(): Promise<P1682ReadinessSnapshot[]> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const parsed = JSON.parse(raw) as SnapshotStore;
    return parsed.snapshots ?? [];
  } catch {
    return [];
  }
}

export async function appendP1682ReadinessSnapshot(
  snapshot: P1682ReadinessSnapshot,
): Promise<P1682ReadinessSnapshot[]> {
  const existing = await loadP1682ReadinessSnapshots();
  const snapshots = [snapshot, ...existing.filter((s) => s.at !== snapshot.at)].slice(0, MAX_SNAPSHOTS);
  const now = new Date().toISOString();
  await safeRecruitingMkdir();
  await writeFile(
    snapshotPath(),
    `${JSON.stringify({ snapshots, updatedAt: now, sourcePhase: P168_2_SOURCE_PHASE }, null, 2)}\n`,
    "utf8",
  );
  return snapshots;
}
