import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { PaperworkCycleMonitorState, PaperworkCycleReport } from "@/lib/autonomous-paperwork-orchestrator/types";

export function paperworkCycleStatePath(): string {
  return path.join(recruitingDataDir(), "p123-paperwork-cycle-monitor.json");
}

export async function loadPaperworkCycleMonitorState(): Promise<PaperworkCycleMonitorState> {
  try {
    const raw = await readFile(paperworkCycleStatePath(), "utf8");
    return JSON.parse(raw) as PaperworkCycleMonitorState;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), currentCycle: null };
  }
}

export async function savePaperworkCycleMonitorState(report: PaperworkCycleReport): Promise<void> {
  const state: PaperworkCycleMonitorState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    currentCycle: report,
  };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(paperworkCycleStatePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
