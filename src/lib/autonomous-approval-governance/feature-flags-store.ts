import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GovernanceExecutionMode, P77FeatureFlags } from "@/lib/autonomous-approval-governance/types";
import {
  P77_DEFAULT_EXECUTION_MODE,
  P77_DEFAULT_GOVERNANCE_ENABLED,
  P77_PREVIEW_MODE,
} from "@/lib/autonomous-approval-governance/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p77-approval-governance-flags.json");
}

export const DEFAULT_P77_FEATURE_FLAGS: P77FeatureFlags = {
  governanceEnabled: P77_DEFAULT_GOVERNANCE_ENABLED,
  executionMode: P77_DEFAULT_EXECUTION_MODE,
  previewMode: P77_PREVIEW_MODE,
  updatedAt: new Date().toISOString(),
};

function parseExecutionMode(value: string | undefined): GovernanceExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "preview" ||
    normalized === "pilot" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return P77_DEFAULT_EXECUTION_MODE;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP77FeatureFlagsFromEnv(
  base: P77FeatureFlags = DEFAULT_P77_FEATURE_FLAGS,
): P77FeatureFlags {
  return {
    governanceEnabled: parseBool(process.env.P77_GOVERNANCE_ENABLED, base.governanceEnabled),
    executionMode: parseExecutionMode(process.env.P77_EXECUTION_MODE) ?? base.executionMode,
    previewMode: parseBool(process.env.P77_PREVIEW_MODE, base.previewMode),
    updatedAt: base.updatedAt,
  };
}

export async function loadP77FeatureFlags(): Promise<P77FeatureFlags> {
  let stored = DEFAULT_P77_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P77FeatureFlags> };
    stored = { ...DEFAULT_P77_FEATURE_FLAGS, ...parsed.flags };
  } catch {
    // use defaults
  }
  return resolveP77FeatureFlagsFromEnv(stored);
}

export async function saveP77FeatureFlags(flags: P77FeatureFlags): Promise<P77FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP77FeatureFlagsFromEnv(saved);
}

export function canExecuteGovernance(flags: P77FeatureFlags): boolean {
  return flags.governanceEnabled && flags.executionMode === "production" && !flags.previewMode;
}

export function isPreviewGovernance(flags: P77FeatureFlags): boolean {
  return !canExecuteGovernance(flags);
}
