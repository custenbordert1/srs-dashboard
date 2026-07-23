import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";

export const LIVE_PILOT_ENV_VARS = [
  "AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED",
  "AUTONOMOUS_PAPERWORK_LIVE_MODE",
  "AUTONOMOUS_PAPERWORK_OPERATOR_GO",
] as const;

export const LIVE_PILOT_ENV_EXPORT_BLOCK = [
  "export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true",
  "export AUTONOMOUS_PAPERWORK_LIVE_MODE=true",
  "export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true",
].join("\n");

export type LivePilotEnvStatus = {
  ok: boolean;
  present: Record<(typeof LIVE_PILOT_ENV_VARS)[number], boolean>;
  missing: string[];
  exportBlock: string;
};

export function inspectLivePilotEnv(
  env: NodeJS.ProcessEnv = process.env,
): LivePilotEnvStatus {
  const present = {
    AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED:
      env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED === "true",
    AUTONOMOUS_PAPERWORK_LIVE_MODE: env.AUTONOMOUS_PAPERWORK_LIVE_MODE === "true",
    AUTONOMOUS_PAPERWORK_OPERATOR_GO: env.AUTONOMOUS_PAPERWORK_OPERATOR_GO === "true",
  };
  const missing = LIVE_PILOT_ENV_VARS.filter((key) => !present[key]);
  return {
    ok: missing.length === 0,
    present,
    missing,
    exportBlock: LIVE_PILOT_ENV_EXPORT_BLOCK,
  };
}

/**
 * Fail before any live send attempt when P122/P123 pilot env gates are unset.
 */
export function assertLivePilotEnvForExecute(
  env: NodeJS.ProcessEnv = process.env,
): LivePilotEnvStatus {
  const status = inspectLivePilotEnv(env);
  if (!status.ok) {
    throw new Error(
      `Live paperwork blocked: missing pilot env var(s): ${status.missing.join(", ")}.\n` +
        `Set all three before --live --confirm-live:\n\n` +
        `${status.exportBlock}\n`,
    );
  }
  return status;
}

/**
 * When --live --confirm-live are both set, auto-apply the canonical P122 phrase
 * unless --confirm was provided explicitly.
 */
export function resolveOpenStoresConfirmationPhrase(input: {
  live: boolean;
  confirmLive: boolean;
  confirmFlag: string | null;
}): { phrase: string | undefined; autoInjected: boolean } {
  if (!input.live || !input.confirmLive) {
    return { phrase: input.confirmFlag?.trim() || undefined, autoInjected: false };
  }
  const explicit = input.confirmFlag?.trim();
  if (explicit) {
    return { phrase: explicit, autoInjected: false };
  }
  return { phrase: P122_CONFIRMATION_PHRASE, autoInjected: true };
}

/**
 * Ensure P122 maxSends is at least `minMaxSends` (default pilot max is 1).
 * Mutates process.env for the remainder of the process.
 */
export function ensurePilotMaxSendsForCanary(
  minMaxSends: number,
  env: NodeJS.ProcessEnv = process.env,
): { applied: boolean; maxSends: number; message: string } {
  const config = loadPilotConfig(env);
  const needed = Math.max(1, Math.floor(minMaxSends));
  if (config.maxSends >= needed) {
    return {
      applied: false,
      maxSends: config.maxSends,
      message: `P122 pilot maxSends=${config.maxSends} already covers required=${needed}`,
    };
  }
  env.AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS = String(needed);
  return {
    applied: true,
    maxSends: needed,
    message:
      `Raised AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS ${config.maxSends} → ${needed} ` +
      `for live canary headroom`,
  };
}
