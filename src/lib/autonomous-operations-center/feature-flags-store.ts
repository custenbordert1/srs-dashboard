import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OperationsExecutionMode, P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import {
  P75_DEFAULT_EXECUTION_MODE,
  P75_DEFAULT_OPERATIONS_CENTER_ENABLED,
  P75_PREVIEW_MODE,
} from "@/lib/autonomous-operations-center/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p75-operations-center-flags.json");
}

export const DEFAULT_P75_FEATURE_FLAGS: P75FeatureFlags = {
  operationsCenterEnabled: P75_DEFAULT_OPERATIONS_CENTER_ENABLED,
  executionMode: P75_DEFAULT_EXECUTION_MODE,
  previewMode: P75_PREVIEW_MODE,
  updatedAt: new Date().toISOString(),
};

function parseExecutionMode(value: string | undefined): OperationsExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "preview" ||
    normalized === "pilot" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return P75_DEFAULT_EXECUTION_MODE;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP75FeatureFlagsFromEnv(
  base: P75FeatureFlags = DEFAULT_P75_FEATURE_FLAGS,
): P75FeatureFlags {
  return {
    operationsCenterEnabled: parseBool(process.env.P75_OPERATIONS_CENTER_ENABLED, base.operationsCenterEnabled),
    executionMode: parseExecutionMode(process.env.P75_EXECUTION_MODE) ?? base.executionMode,
    previewMode: parseBool(process.env.P75_PREVIEW_MODE, base.previewMode),
    updatedAt: base.updatedAt,
  };
}

export async function loadP75FeatureFlags(): Promise<P75FeatureFlags> {
  let stored = DEFAULT_P75_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P75FeatureFlags> };
    stored = { ...DEFAULT_P75_FEATURE_FLAGS, ...parsed.flags };
  } catch {
    // use defaults
  }
  return resolveP75FeatureFlagsFromEnv(stored);
}

export async function saveP75FeatureFlags(flags: P75FeatureFlags): Promise<P75FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP75FeatureFlagsFromEnv(saved);
}

export function canExecuteOperationsCenter(flags: P75FeatureFlags): boolean {
  return flags.operationsCenterEnabled && flags.executionMode === "production" && !flags.previewMode;
}

export function isPreviewOperationsCenter(flags: P75FeatureFlags): boolean {
  return !canExecuteOperationsCenter(flags);
}
