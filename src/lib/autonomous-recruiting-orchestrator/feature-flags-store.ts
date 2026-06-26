import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OrchestratorExecutionMode, P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import {
  P74_DEFAULT_EXECUTION_MODE,
  P74_DEFAULT_ORCHESTRATOR_ENABLED,
  P74_PREVIEW_MODE,
} from "@/lib/autonomous-recruiting-orchestrator/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p74-recruiting-orchestrator-flags.json");
}

export const DEFAULT_P74_FEATURE_FLAGS: P74FeatureFlags = {
  orchestratorEnabled: P74_DEFAULT_ORCHESTRATOR_ENABLED,
  executionMode: P74_DEFAULT_EXECUTION_MODE,
  previewMode: P74_PREVIEW_MODE,
  updatedAt: new Date().toISOString(),
};

function parseExecutionMode(value: string | undefined): OrchestratorExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "preview" ||
    normalized === "pilot" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return P74_DEFAULT_EXECUTION_MODE;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP74FeatureFlagsFromEnv(
  base: P74FeatureFlags = DEFAULT_P74_FEATURE_FLAGS,
): P74FeatureFlags {
  return {
    orchestratorEnabled: parseBool(process.env.P74_ORCHESTRATOR_ENABLED, base.orchestratorEnabled),
    executionMode: parseExecutionMode(process.env.P74_EXECUTION_MODE) ?? base.executionMode,
    previewMode: parseBool(process.env.P74_PREVIEW_MODE, base.previewMode),
    updatedAt: base.updatedAt,
  };
}

export async function loadP74FeatureFlags(): Promise<P74FeatureFlags> {
  let stored = DEFAULT_P74_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P74FeatureFlags> };
    stored = { ...DEFAULT_P74_FEATURE_FLAGS, ...parsed.flags };
  } catch {
    // use defaults
  }
  return resolveP74FeatureFlagsFromEnv(stored);
}

export async function saveP74FeatureFlags(flags: P74FeatureFlags): Promise<P74FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP74FeatureFlagsFromEnv(saved);
}

export function canExecuteOrchestrator(flags: P74FeatureFlags): boolean {
  return flags.orchestratorEnabled && flags.executionMode === "production" && !flags.previewMode;
}

export function isPreviewOrchestrator(flags: P74FeatureFlags): boolean {
  return !canExecuteOrchestrator(flags);
}
