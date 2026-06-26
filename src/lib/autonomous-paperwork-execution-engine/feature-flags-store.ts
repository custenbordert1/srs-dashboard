import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { P71FeatureFlags, PaperworkExecutionMode } from "@/lib/autonomous-paperwork-execution-engine/types";
import {
  P71_DEFAULT_AUTOMATION_ENABLED,
  P71_DEFAULT_EXECUTION_MODE,
} from "@/lib/autonomous-paperwork-execution-engine/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p71-paperwork-execution-flags.json");
}

export const DEFAULT_P71_FEATURE_FLAGS: P71FeatureFlags = {
  automationEnabled: P71_DEFAULT_AUTOMATION_ENABLED,
  executionMode: P71_DEFAULT_EXECUTION_MODE,
  dropboxExecution: false,
  pilotRecruiters: [],
  pilotDistrictManagers: [],
  pilotTerritories: [],
  pilotMarkets: [],
  pilotStates: [],
  pilotClients: [],
  pilotProjects: [],
  updatedAt: new Date().toISOString(),
};

function parseList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseExecutionMode(value: string | undefined): PaperworkExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "preview" ||
    normalized === "pilot" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return P71_DEFAULT_EXECUTION_MODE;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP71FeatureFlagsFromEnv(
  base: P71FeatureFlags = DEFAULT_P71_FEATURE_FLAGS,
): P71FeatureFlags {
  return {
    automationEnabled: parseBool(process.env.P71_AUTOMATION_ENABLED, base.automationEnabled),
    executionMode: parseExecutionMode(process.env.P71_EXECUTION_MODE) ?? base.executionMode,
    dropboxExecution: parseBool(process.env.P71_DROPBOX_EXECUTION, base.dropboxExecution),
    pilotRecruiters: parseList(process.env.P71_PILOT_RECRUITERS).length
      ? parseList(process.env.P71_PILOT_RECRUITERS)
      : base.pilotRecruiters,
    pilotDistrictManagers: parseList(process.env.P71_PILOT_DISTRICT_MANAGERS).length
      ? parseList(process.env.P71_PILOT_DISTRICT_MANAGERS)
      : base.pilotDistrictManagers,
    pilotTerritories: parseList(process.env.P71_PILOT_TERRITORIES).length
      ? parseList(process.env.P71_PILOT_TERRITORIES)
      : base.pilotTerritories,
    pilotMarkets: parseList(process.env.P71_PILOT_MARKETS).length
      ? parseList(process.env.P71_PILOT_MARKETS)
      : base.pilotMarkets,
    pilotStates: parseList(process.env.P71_PILOT_STATES).length
      ? parseList(process.env.P71_PILOT_STATES)
      : base.pilotStates,
    pilotClients: parseList(process.env.P71_PILOT_CLIENTS).length
      ? parseList(process.env.P71_PILOT_CLIENTS)
      : base.pilotClients,
    pilotProjects: parseList(process.env.P71_PILOT_PROJECTS).length
      ? parseList(process.env.P71_PILOT_PROJECTS)
      : base.pilotProjects,
    updatedAt: base.updatedAt,
  };
}

function mergeFlags(parsed: Partial<P71FeatureFlags>): P71FeatureFlags {
  return {
    ...DEFAULT_P71_FEATURE_FLAGS,
    ...parsed,
    pilotRecruiters: parsed.pilotRecruiters ?? DEFAULT_P71_FEATURE_FLAGS.pilotRecruiters,
    pilotDistrictManagers:
      parsed.pilotDistrictManagers ?? DEFAULT_P71_FEATURE_FLAGS.pilotDistrictManagers,
    pilotTerritories: parsed.pilotTerritories ?? DEFAULT_P71_FEATURE_FLAGS.pilotTerritories,
    pilotMarkets: parsed.pilotMarkets ?? DEFAULT_P71_FEATURE_FLAGS.pilotMarkets,
    pilotStates: parsed.pilotStates ?? DEFAULT_P71_FEATURE_FLAGS.pilotStates,
    pilotClients: parsed.pilotClients ?? DEFAULT_P71_FEATURE_FLAGS.pilotClients,
    pilotProjects: parsed.pilotProjects ?? DEFAULT_P71_FEATURE_FLAGS.pilotProjects,
  };
}

export async function loadP71FeatureFlags(): Promise<P71FeatureFlags> {
  let stored = DEFAULT_P71_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P71FeatureFlags> };
    stored = mergeFlags(parsed.flags ?? {});
  } catch {
    // use defaults
  }
  return resolveP71FeatureFlagsFromEnv(stored);
}

export async function saveP71FeatureFlags(flags: P71FeatureFlags): Promise<P71FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP71FeatureFlagsFromEnv(saved);
}

export function canExecutePaperwork(flags: P71FeatureFlags): boolean {
  return (
    flags.automationEnabled &&
    flags.executionMode === "production" &&
    flags.dropboxExecution
  );
}

export function isPreviewExecution(flags: P71FeatureFlags): boolean {
  return !canExecutePaperwork(flags);
}
