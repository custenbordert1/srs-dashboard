import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function policyPath(): string {
  return path.join(recruitingDataDir(), "candidate-onboarding-policy.json");
}

export const DEFAULT_CANDIDATE_ONBOARDING_POLICY: CandidateOnboardingPolicy = {
  enabled: false,
  mode: "semi-automatic",
  dryRun: false,
  send: { enabled: true, requireApproval: true },
  reminders: { enabled: true },
  escalation: { enabled: true, requireApproval: true },
  maxEscalationsPerRun: 10,
  maxSendsPerRun: 25,
  maxRetries: 3,
  reminderHours: [24, 72, 168],
  escalationOverdueHours: 168,
  updatedAt: new Date().toISOString(),
};

type PolicyStoreFile = {
  policy: CandidateOnboardingPolicy;
  updatedAt: string;
};

function mergePolicy(parsed: Partial<CandidateOnboardingPolicy>): CandidateOnboardingPolicy {
  return {
    ...DEFAULT_CANDIDATE_ONBOARDING_POLICY,
    ...parsed,
    send: { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY.send, ...parsed.send },
    reminders: { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY.reminders, ...parsed.reminders },
    escalation: { ...DEFAULT_CANDIDATE_ONBOARDING_POLICY.escalation, ...parsed.escalation },
    reminderHours: parsed.reminderHours ?? DEFAULT_CANDIDATE_ONBOARDING_POLICY.reminderHours,
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
    return { policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY, updatedAt: new Date().toISOString() };
  }
}

async function writePolicyFile(file: PolicyStoreFile): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(policyPath(), `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

export async function loadCandidateOnboardingPolicy(): Promise<CandidateOnboardingPolicy> {
  return (await readPolicyFile()).policy;
}

export async function saveCandidateOnboardingPolicy(
  policy: CandidateOnboardingPolicy,
): Promise<CandidateOnboardingPolicy> {
  const now = new Date().toISOString();
  const saved: CandidateOnboardingPolicy = { ...policy, updatedAt: now };
  await writePolicyFile({ policy: saved, updatedAt: now });
  return saved;
}

export function isCandidateOnboardingActive(policy: CandidateOnboardingPolicy): boolean {
  return policy.enabled && policy.mode !== "disabled";
}
