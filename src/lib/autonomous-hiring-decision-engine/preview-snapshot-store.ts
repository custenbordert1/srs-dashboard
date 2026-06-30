import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HiringDecisionPreviewSnapshot } from "@/lib/autonomous-hiring-decision-engine/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function snapshotPath(): string {
  return path.join(recruitingDataDir(), "p87-hiring-decisions-preview.json");
}

export async function saveHiringDecisionPreviewSnapshot(
  snapshot: HiringDecisionPreviewSnapshot,
): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(snapshotPath(), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function hiringDecisionPreviewSnapshotPath(): string {
  return snapshotPath();
}
