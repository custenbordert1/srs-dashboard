import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DecisionExecutionMode, P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import {
  P76_DEFAULT_DECISION_ENGINE_ENABLED,
  P76_DEFAULT_EXECUTION_MODE,
  P76_PREVIEW_MODE,
} from "@/lib/autonomous-decision-engine/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p76-decision-engine-flags.json");
}

export const DEFAULT_P76_FEATURE_FLAGS: P76FeatureFlags = {
  decisionEngineEnabled: P76_DEFAULT_DECISION_ENGINE_ENABLED,
  executionMode: P76_DEFAULT_EXECUTION_MODE,
  previewMode: P76_PREVIEW_MODE,
  updatedAt: new Date().toISOString(),
};

function parseExecutionMode(value: string | undefined): DecisionExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "preview" ||
    normalized === "pilot" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return P76_DEFAULT_EXECUTION_MODE;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP76FeatureFlagsFromEnv(
  base: P76FeatureFlags = DEFAULT_P76_FEATURE_FLAGS,
): P76FeatureFlags {
  return {
    decisionEngineEnabled: parseBool(process.env.P76_DECISION_ENGINE_ENABLED, base.decisionEngineEnabled),
    executionMode: parseExecutionMode(process.env.P76_EXECUTION_MODE) ?? base.executionMode,
    previewMode: parseBool(process.env.P76_PREVIEW_MODE, base.previewMode),
    updatedAt: base.updatedAt,
  };
}

export async function loadP76FeatureFlags(): Promise<P76FeatureFlags> {
  let stored = DEFAULT_P76_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P76FeatureFlags> };
    stored = { ...DEFAULT_P76_FEATURE_FLAGS, ...parsed.flags };
  } catch {
    // use defaults
  }
  return resolveP76FeatureFlagsFromEnv(stored);
}

export async function saveP76FeatureFlags(flags: P76FeatureFlags): Promise<P76FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await safeRecruitingMkdir();
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP76FeatureFlagsFromEnv(saved);
}

export function canExecuteDecisionEngine(flags: P76FeatureFlags): boolean {
  return flags.decisionEngineEnabled && flags.executionMode === "production" && !flags.previewMode;
}

export function isPreviewDecisionEngine(flags: P76FeatureFlags): boolean {
  return !canExecuteDecisionEngine(flags);
}
