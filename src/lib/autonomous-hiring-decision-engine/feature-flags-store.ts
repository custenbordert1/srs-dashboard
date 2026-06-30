import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { P87FeatureFlags } from "@/lib/autonomous-hiring-decision-engine/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p87-hiring-decision-flags.json");
}

export const DEFAULT_P87_FEATURE_FLAGS: P87FeatureFlags = {
  enabled: true,
  previewMode: true,
  refreshOnIngestion: true,
  updatedAt: new Date().toISOString(),
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP87FeatureFlagsFromEnv(
  base: P87FeatureFlags = DEFAULT_P87_FEATURE_FLAGS,
): P87FeatureFlags {
  return {
    enabled: parseBool(process.env.P87_ENABLED, base.enabled),
    previewMode: parseBool(process.env.P87_PREVIEW_MODE, base.previewMode),
    refreshOnIngestion: parseBool(process.env.P87_REFRESH_ON_INGESTION, base.refreshOnIngestion),
    updatedAt: base.updatedAt,
  };
}

export async function loadP87FeatureFlags(): Promise<P87FeatureFlags> {
  let stored = DEFAULT_P87_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P87FeatureFlags> };
    stored = { ...DEFAULT_P87_FEATURE_FLAGS, ...parsed.flags };
  } catch {
    // defaults
  }
  return resolveP87FeatureFlagsFromEnv(stored);
}

export async function saveP87FeatureFlags(flags: P87FeatureFlags): Promise<P87FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP87FeatureFlagsFromEnv(saved);
}

export function isPreviewHiringDecisionEngine(flags: P87FeatureFlags): boolean {
  return flags.previewMode !== false;
}
