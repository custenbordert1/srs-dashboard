import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  P246_DASHBOARD_SNAPSHOT_FILENAME,
  type P246DashboardMetrics,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

function snapshotPath(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  const dir = override ? path.resolve(override) : recruitingDataDir();
  return path.join(dir, P246_DASHBOARD_SNAPSHOT_FILENAME);
}

export async function writeP246DashboardSnapshot(
  metrics: P246DashboardMetrics,
): Promise<string> {
  const filePath = snapshotPath();
  await safeRecruitingMkdir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  return filePath;
}

export async function readP246DashboardSnapshot(): Promise<P246DashboardMetrics | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const parsed = JSON.parse(raw) as P246DashboardMetrics;
    if (typeof parsed.totalOutstandingPaperwork !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
