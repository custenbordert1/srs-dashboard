import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AutopilotOperatingMode,
  AutopilotPolicy,
  AutopilotRunEntry,
} from "@/lib/autonomous-recruiting-autopilot/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function policyPath(): string {
  return path.join(recruitingDataDir(), "autonomous-recruiting-autopilot-policy.json");
}

function runsPath(): string {
  return path.join(recruitingDataDir(), "autonomous-recruiting-autopilot-runs.json");
}

const DEFAULT_POLICY: AutopilotPolicy = {
  mode: "semi-automatic",
  paused: false,
  updatedAt: new Date().toISOString(),
};

type PolicyStoreFile = {
  policy: AutopilotPolicy;
  updatedAt: string;
};

type RunsStoreFile = {
  runs: AutopilotRunEntry[];
  updatedAt: string;
};

async function readPolicyFile(): Promise<PolicyStoreFile> {
  try {
    const raw = await readFile(policyPath(), "utf8");
    const parsed = JSON.parse(raw) as PolicyStoreFile;
    return {
      policy: parsed.policy ?? DEFAULT_POLICY,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { policy: DEFAULT_POLICY, updatedAt: new Date().toISOString() };
  }
}

async function writePolicyFile(file: PolicyStoreFile): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(policyPath(), JSON.stringify(file, null, 2), "utf8");
}

async function readRunsFile(): Promise<RunsStoreFile> {
  try {
    const raw = await readFile(runsPath(), "utf8");
    const parsed = JSON.parse(raw) as RunsStoreFile;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { runs: [], updatedAt: new Date().toISOString() };
  }
}

async function writeRunsFile(file: RunsStoreFile): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(runsPath(), JSON.stringify(file, null, 2), "utf8");
}

export async function loadAutopilotPolicy(): Promise<AutopilotPolicy> {
  return (await readPolicyFile()).policy;
}

export async function saveAutopilotPolicy(policy: AutopilotPolicy): Promise<AutopilotPolicy> {
  const now = new Date().toISOString();
  const saved: AutopilotPolicy = { ...policy, updatedAt: now };
  await writePolicyFile({ policy: saved, updatedAt: now });
  return saved;
}

export async function setAutopilotMode(mode: AutopilotOperatingMode): Promise<AutopilotPolicy> {
  const policy = await loadAutopilotPolicy();
  return saveAutopilotPolicy({ ...policy, mode, paused: false });
}

export async function pauseAutopilot(pausedBy?: string): Promise<AutopilotPolicy> {
  const policy = await loadAutopilotPolicy();
  const now = new Date().toISOString();
  return saveAutopilotPolicy({
    ...policy,
    paused: true,
    pausedAt: now,
    pausedBy: pausedBy ?? "executive",
  });
}

export async function resumeAutopilot(): Promise<AutopilotPolicy> {
  const policy = await loadAutopilotPolicy();
  return saveAutopilotPolicy({
    ...policy,
    paused: false,
    pausedAt: undefined,
    pausedBy: undefined,
  });
}

export async function recordAutopilotRun(entry: AutopilotRunEntry): Promise<void> {
  const file = await readRunsFile();
  file.runs.unshift(entry);
  file.runs = file.runs.slice(0, 50);
  file.updatedAt = new Date().toISOString();
  await writeRunsFile(file);

  const policy = await loadAutopilotPolicy();
  await saveAutopilotPolicy({ ...policy, lastRunAt: entry.completedAt });
}

export async function listAutopilotRuns(limit = 10): Promise<AutopilotRunEntry[]> {
  return (await readRunsFile()).runs.slice(0, limit);
}

export function createAutopilotRunId(): string {
  return randomUUID();
}
