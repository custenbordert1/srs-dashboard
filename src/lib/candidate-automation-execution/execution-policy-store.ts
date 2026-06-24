import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateExecutionPolicy } from "@/lib/candidate-automation-execution/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function policyPath(): string {
  return path.join(recruitingDataDir(), "candidate-automation-execution-policy.json");
}

export const DEFAULT_CANDIDATE_EXECUTION_POLICY: CandidateExecutionPolicy = {
  enabled: false,
  mode: "semi-automatic",
  dryRun: false,
  paperwork: { enabled: true },
  escalation: { enabled: true, requireApproval: true },
  maxRetries: 3,
  escalationDelayHours: 48,
  maxEscalationsPerRun: 10,
  updatedAt: new Date().toISOString(),
};

type PolicyStoreFile = {
  policy: CandidateExecutionPolicy;
  updatedAt: string;
};

function mergePolicy(parsed: Partial<CandidateExecutionPolicy>): CandidateExecutionPolicy {
  return {
    ...DEFAULT_CANDIDATE_EXECUTION_POLICY,
    ...parsed,
    paperwork: { ...DEFAULT_CANDIDATE_EXECUTION_POLICY.paperwork, ...parsed.paperwork },
    escalation: { ...DEFAULT_CANDIDATE_EXECUTION_POLICY.escalation, ...parsed.escalation },
  };
}

async function readPolicyFile(): Promise<PolicyStoreFile> {
  try {
    const raw = await readFile(policyPath(), "utf8");
    const parsed = JSON.parse(raw) as PolicyStoreFile;
    return {
      policy: mergePolicy(parsed.policy ?? {}),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { policy: DEFAULT_CANDIDATE_EXECUTION_POLICY, updatedAt: new Date().toISOString() };
  }
}

async function writePolicyFile(file: PolicyStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(policyPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function loadCandidateExecutionPolicy(): Promise<CandidateExecutionPolicy> {
  return (await readPolicyFile()).policy;
}

export async function saveCandidateExecutionPolicy(
  policy: CandidateExecutionPolicy,
): Promise<CandidateExecutionPolicy> {
  const now = new Date().toISOString();
  const saved: CandidateExecutionPolicy = { ...policy, updatedAt: now };
  await writePolicyFile({ policy: saved, updatedAt: now });
  return saved;
}

export function isCandidateExecutionActive(policy: CandidateExecutionPolicy): boolean {
  return policy.enabled && policy.mode !== "disabled";
}
