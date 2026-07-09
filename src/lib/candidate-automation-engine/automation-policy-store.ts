import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateAutomationPolicy } from "@/lib/candidate-automation-engine/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function policyPath(): string {
  return path.join(recruitingDataDir(), "candidate-automation-policy.json");
}

export const DEFAULT_CANDIDATE_AUTOMATION_POLICY: CandidateAutomationPolicy = {
  mode: "semi-automatic",
  paused: false,
  assign: { enabled: true },
  actions: { enabled: true },
  progression: { enabled: true },
  advancement: { enabled: true },
  paperworkSend: { enabled: false },
  execution: { enabled: false },
  escalation: { enabled: false },
  rebalance: { enabled: false },
  updatedAt: new Date().toISOString(),
};

type PolicyStoreFile = {
  policy: CandidateAutomationPolicy;
  updatedAt: string;
};

async function readPolicyFile(): Promise<PolicyStoreFile> {
  try {
    const raw = await readFile(policyPath(), "utf8");
    const parsed = JSON.parse(raw) as PolicyStoreFile;
    return {
      policy: { ...DEFAULT_CANDIDATE_AUTOMATION_POLICY, ...parsed.policy },
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { policy: DEFAULT_CANDIDATE_AUTOMATION_POLICY, updatedAt: new Date().toISOString() };
  }
}

async function writePolicyFile(file: PolicyStoreFile): Promise<void> {
  await safeRecruitingMkdir();
  await writeFile(policyPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function loadCandidateAutomationPolicy(): Promise<CandidateAutomationPolicy> {
  return (await readPolicyFile()).policy;
}

export async function saveCandidateAutomationPolicy(
  policy: CandidateAutomationPolicy,
): Promise<CandidateAutomationPolicy> {
  const now = new Date().toISOString();
  const saved: CandidateAutomationPolicy = { ...policy, updatedAt: now };
  await writePolicyFile({ policy: saved, updatedAt: now });
  return saved;
}
