import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

export const RECRUITING_STORE_FILES = {
  correlation: "autopilot-execution-correlation.json",
  accountability: "executive-accountability.json",
  jobDrafts: "job-drafts.json",
  automationRuns: "hiring-automation-runs.json",
  autopilotPolicy: "autonomous-recruiting-autopilot-policy.json",
  autopilotRuns: "autonomous-recruiting-autopilot-runs.json",
  autopilotFeedback: "autonomous-recruiting-feedback.json",
  legacyTasks: "autopilot-recruiter-tasks.json",
  legacyExecutions: "autopilot-executions.json",
} as const;

export function recruitingStorePath(fileName: string): string {
  return path.join(recruitingDataDir(), fileName);
}

export type IsolatedRecruitingDataHandle = {
  dir: string;
  restore: () => Promise<void>;
};

export async function installIsolatedRecruitingDataDir(
  prefix: string,
): Promise<IsolatedRecruitingDataHandle> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const previous = process.env.SRS_RECRUITING_DATA_DIR;
  process.env.SRS_RECRUITING_DATA_DIR = dir;

  return {
    dir,
    async restore() {
      if (previous === undefined) delete process.env.SRS_RECRUITING_DATA_DIR;
      else process.env.SRS_RECRUITING_DATA_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    },
  };
}
