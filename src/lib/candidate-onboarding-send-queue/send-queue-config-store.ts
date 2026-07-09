import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OnboardingSendQueueConfig } from "@/lib/candidate-onboarding-send-queue/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function configPath(): string {
  return path.join(recruitingDataDir(), "candidate-onboarding-send-queue-config.json");
}

export const DEFAULT_ONBOARDING_SEND_QUEUE_CONFIG: OnboardingSendQueueConfig = {
  maxConcurrentSends: 1,
  batchSize: 8,
  delayBetweenSendsMs: 6_500,
  delayBetweenBatchesMs: 60_000,
  maxRetries: 3,
  retryBackoffBaseMs: 30_000,
  sendingStaleMs: 5 * 60_000,
  defaultTemplateKey: "onboarding_packet",
  updatedAt: new Date().toISOString(),
};

type ConfigStoreFile = {
  config: OnboardingSendQueueConfig;
  updatedAt: string;
};

function mergeConfig(parsed: Partial<OnboardingSendQueueConfig>): OnboardingSendQueueConfig {
  return {
    ...DEFAULT_ONBOARDING_SEND_QUEUE_CONFIG,
    ...parsed,
    defaultTemplateKey:
      parsed.defaultTemplateKey ?? DEFAULT_ONBOARDING_SEND_QUEUE_CONFIG.defaultTemplateKey,
  };
}

export async function loadOnboardingSendQueueConfig(): Promise<OnboardingSendQueueConfig> {
  try {
    const raw = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as ConfigStoreFile;
    return mergeConfig(parsed.config ?? {});
  } catch {
    return { ...DEFAULT_ONBOARDING_SEND_QUEUE_CONFIG };
  }
}

export async function saveOnboardingSendQueueConfig(
  config: OnboardingSendQueueConfig,
): Promise<OnboardingSendQueueConfig> {
  const now = new Date().toISOString();
  const saved = { ...config, updatedAt: now };
  await safeRecruitingMkdir();
  await writeFile(configPath(), `${JSON.stringify({ config: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return saved;
}
