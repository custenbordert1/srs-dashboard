import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CommandCenterExecutionMode, P78FeatureFlags } from "@/lib/ai-command-center/types";
import {
  P78_DEFAULT_COMMAND_CENTER_ENABLED,
  P78_DEFAULT_EXECUTION_MODE,
  P78_PREVIEW_MODE,
} from "@/lib/ai-command-center/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p78-command-center-flags.json");
}

export const DEFAULT_P78_FEATURE_FLAGS: P78FeatureFlags = {
  commandCenterEnabled: P78_DEFAULT_COMMAND_CENTER_ENABLED,
  executionMode: P78_DEFAULT_EXECUTION_MODE,
  previewMode: P78_PREVIEW_MODE,
  updatedAt: new Date().toISOString(),
};

function parseExecutionMode(value: string | undefined): CommandCenterExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "preview" ||
    normalized === "pilot" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return P78_DEFAULT_EXECUTION_MODE;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP78FeatureFlagsFromEnv(
  base: P78FeatureFlags = DEFAULT_P78_FEATURE_FLAGS,
): P78FeatureFlags {
  return {
    commandCenterEnabled: parseBool(process.env.P78_COMMAND_CENTER_ENABLED, base.commandCenterEnabled),
    executionMode: parseExecutionMode(process.env.P78_EXECUTION_MODE) ?? base.executionMode,
    previewMode: parseBool(process.env.P78_PREVIEW_MODE, base.previewMode),
    updatedAt: base.updatedAt,
  };
}

export async function loadP78FeatureFlags(): Promise<P78FeatureFlags> {
  let stored = DEFAULT_P78_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P78FeatureFlags> };
    stored = { ...DEFAULT_P78_FEATURE_FLAGS, ...parsed.flags };
  } catch {
    // use defaults
  }
  return resolveP78FeatureFlagsFromEnv(stored);
}

export async function saveP78FeatureFlags(flags: P78FeatureFlags): Promise<P78FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await safeRecruitingMkdir();
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP78FeatureFlagsFromEnv(saved);
}

export function canExecuteCommandCenter(flags: P78FeatureFlags): boolean {
  return flags.commandCenterEnabled && flags.executionMode === "production" && !flags.previewMode;
}

export function isPreviewCommandCenter(flags: P78FeatureFlags): boolean {
  return !canExecuteCommandCenter(flags);
}
