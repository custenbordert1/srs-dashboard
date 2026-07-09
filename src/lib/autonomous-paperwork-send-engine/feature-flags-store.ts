import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

function flagsPath(): string {
  return path.join(recruitingDataDir(), "p84-paperwork-send-flags.json");
}

export const DEFAULT_P84_FEATURE_FLAGS: P84FeatureFlags = {
  enabled: false,
  liveMode: false,
  liveSend: false,
  requireApproval: false,
  maxSendsPerRun: 25,
  monitorSignatures: true,
  updatedAt: new Date().toISOString(),
};

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

export function resolveP84FeatureFlagsFromEnv(
  base: P84FeatureFlags = DEFAULT_P84_FEATURE_FLAGS,
): P84FeatureFlags {
  const maxSends = Number.parseInt(process.env.P84_MAX_SENDS_PER_RUN ?? "", 10);
  return {
    enabled: parseBool(process.env.P84_ENABLED, base.enabled),
    liveMode: parseBool(process.env.P84_LIVE_MODE, base.liveMode),
    liveSend: parseBool(process.env.P84_LIVE_SEND, base.liveSend),
    requireApproval: parseBool(process.env.P84_REQUIRE_APPROVAL, base.requireApproval),
    maxSendsPerRun: Number.isFinite(maxSends) && maxSends > 0 ? maxSends : base.maxSendsPerRun,
    monitorSignatures: parseBool(process.env.P84_MONITOR_SIGNATURES, base.monitorSignatures),
    updatedAt: base.updatedAt,
  };
}

export async function loadP84FeatureFlags(): Promise<P84FeatureFlags> {
  let stored = DEFAULT_P84_FEATURE_FLAGS;
  try {
    const raw = await readFile(flagsPath(), "utf8");
    const parsed = JSON.parse(raw) as { flags?: Partial<P84FeatureFlags> };
    stored = { ...DEFAULT_P84_FEATURE_FLAGS, ...parsed.flags };
  } catch {
    // use defaults
  }
  return resolveP84FeatureFlagsFromEnv(stored);
}

export async function saveP84FeatureFlags(flags: P84FeatureFlags): Promise<P84FeatureFlags> {
  const now = new Date().toISOString();
  const saved = { ...flags, updatedAt: now };
  await safeRecruitingMkdir();
  await writeFile(flagsPath(), `${JSON.stringify({ flags: saved, updatedAt: now }, null, 2)}\n`, "utf8");
  return resolveP84FeatureFlagsFromEnv(saved);
}

export function canLiveSendPaperwork(flags: P84FeatureFlags): boolean {
  return flags.enabled && flags.liveMode && flags.liveSend;
}
