import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CommunicationExecutionMode, P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import {
  P73_DEFAULT_COMMUNICATION_ENABLED,
  P73_DEFAULT_EXECUTION_MODE,
} from "@/lib/autonomous-candidate-communication-engine/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p73-candidate-communication-flags.json");
}

export const DEFAULT_P73_FEATURE_FLAGS: P73FeatureFlags = {
  communicationEnabled: P73_DEFAULT_COMMUNICATION_ENABLED,
  executionMode: P73_DEFAULT_EXECUTION_MODE,
  emailEnabled: false,
  smsEnabled: false,
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

function parseExecutionMode(value: string | undefined): CommunicationExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "off" ||
    normalized === "preview" ||
    normalized === "pilot" ||
    normalized === "production"
  ) {
    return normalized;
  }
  return P73_DEFAULT_EXECUTION_MODE;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP73FeatureFlagsFromEnv(
  base: P73FeatureFlags = DEFAULT_P73_FEATURE_FLAGS,
): P73FeatureFlags {
  return {
    communicationEnabled: parseBool(process.env.P73_COMMUNICATION_ENABLED, base.communicationEnabled),
    executionMode: parseExecutionMode(process.env.P73_EXECUTION_MODE) ?? base.executionMode,
    emailEnabled: parseBool(process.env.P73_EMAIL_ENABLED, base.emailEnabled),
    smsEnabled: parseBool(process.env.P73_SMS_ENABLED, base.smsEnabled),
    pilotRecruiters: parseList(process.env.P73_PILOT_RECRUITERS).length
      ? parseList(process.env.P73_PILOT_RECRUITERS)
      : base.pilotRecruiters,
    pilotDistrictManagers: parseList(process.env.P73_PILOT_DISTRICT_MANAGERS).length
      ? parseList(process.env.P73_PILOT_DISTRICT_MANAGERS)
      : base.pilotDistrictManagers,
    pilotTerritories: parseList(process.env.P73_PILOT_TERRITORIES).length
      ? parseList(process.env.P73_PILOT_TERRITORIES)
      : base.pilotTerritories,
    pilotMarkets: parseList(process.env.P73_PILOT_MARKETS).length
      ? parseList(process.env.P73_PILOT_MARKETS)
      : base.pilotMarkets,
    pilotStates: parseList(process.env.P73_PILOT_STATES).length
      ? parseList(process.env.P73_PILOT_STATES)
      : base.pilotStates,
    pilotClients: parseList(process.env.P73_PILOT_CLIENTS).length
      ? parseList(process.env.P73_PILOT_CLIENTS)
      : base.pilotClients,
    pilotProjects: parseList(process.env.P73_PILOT_PROJECTS).length
      ? parseList(process.env.P73_PILOT_PROJECTS)
      : base.pilotProjects,
    updatedAt: base.updatedAt,
  };
}

function mergeFlags(parsed: Partial<P73FeatureFlags>): P73FeatureFlags {
  return {
    ...DEFAULT_P73_FEATURE_FLAGS,
    ...parsed,
    pilotRecruiters: parsed.pilotRecruiters ?? DEFAULT_P73_FEATURE_FLAGS.pilotRecruiters,
    pilotDistrictManagers:
      parsed.pilotDistrictManagers ?? DEFAULT_P73_FEATURE_FLAGS.pilotDistrictManagers,
    pilotTerritories: parsed.pilotTerritories ?? DEFAULT_P73_FEATURE_FLAGS.pilotTerritories,
    pilotMarkets: parsed.pilotMarkets ?? DEFAULT_P73_FEATURE_FLAGS.pilotMarkets,
    pilotStates: parsed.pilotStates ?? DEFAULT_P73_FEATURE_FLAGS.pilotStates,
    pilotClients: parsed.pilotClients ?? DEFAULT_P73_FEATURE_FLAGS.pilotClients,
    pilotProjects: parsed.pilotProjects ?? DEFAULT_P73_FEATURE_FLAGS.pilotProjects,
  };
}

export async function loadP73FeatureFlags(): Promise<P73FeatureFlags> {
  let stored = DEFAULT_P73_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P73FeatureFlags> };
    stored = mergeFlags(parsed.flags ?? {});
  } catch {
    // use defaults
  }
  return resolveP73FeatureFlagsFromEnv(stored);
}

export async function saveP73FeatureFlags(flags: P73FeatureFlags): Promise<P73FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP73FeatureFlagsFromEnv(saved);
}

export function canExecuteCommunication(flags: P73FeatureFlags): boolean {
  return (
    flags.communicationEnabled &&
    flags.executionMode === "production" &&
    (flags.emailEnabled || flags.smsEnabled)
  );
}

export function isPreviewCommunication(flags: P73FeatureFlags): boolean {
  return !canExecuteCommunication(flags);
}
