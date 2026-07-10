import {
  P122_CONFIRMATION_PHRASE,
  type PilotConfig,
  type PilotSafetyCheck,
} from "@/lib/p122-controlled-live-paperwork-pilot/types";

function check(
  id: PilotSafetyCheck["id"],
  label: string,
  passed: boolean,
  detail: string,
): PilotSafetyCheck {
  return { id, label, passed, detail };
}

export function buildSystemPilotSafetyChecks(input: {
  config: PilotConfig;
  pilotSendCount: number;
  dryRun: boolean;
  confirmationPhrase?: string;
}): PilotSafetyCheck[] {
  return [
    check(
      "pilot_enabled",
      "Live pilot enabled",
      input.config.pilotEnabled,
      input.config.pilotEnabled
        ? "AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true"
        : "Set AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true",
    ),
    check(
      "live_mode_enabled",
      "Live mode enabled",
      input.config.liveModeEnabled,
      input.config.liveModeEnabled
        ? "AUTONOMOUS_PAPERWORK_LIVE_MODE=true"
        : "Set AUTONOMOUS_PAPERWORK_LIVE_MODE=true",
    ),
    check(
      "operator_go",
      "Operator GO",
      input.config.operatorGo,
      input.config.operatorGo
        ? "AUTONOMOUS_PAPERWORK_OPERATOR_GO=true"
        : "Set AUTONOMOUS_PAPERWORK_OPERATOR_GO=true",
    ),
    check(
      "pilot_cap_available",
      "Pilot cap available",
      input.pilotSendCount < input.config.maxSends,
      `${input.pilotSendCount}/${input.config.maxSends} pilot sends used.`,
    ),
    check(
      "dry_run_false",
      "dryRun is false",
      !input.dryRun,
      input.dryRun ? "Execution blocked — dryRun default prevents sends." : "dryRun=false — live execution permitted.",
    ),
    check(
      "confirmation_phrase",
      "Confirmation phrase",
      !input.dryRun
        ? input.confirmationPhrase?.trim() === P122_CONFIRMATION_PHRASE
        : true,
      !input.dryRun
        ? input.confirmationPhrase?.trim() === P122_CONFIRMATION_PHRASE
          ? `Phrase verified: ${P122_CONFIRMATION_PHRASE}`
          : `Required phrase: ${P122_CONFIRMATION_PHRASE}`
        : "Not required for preview/dry-run.",
    ),
  ];
}

export function resolvePilotGoNoGo(checks: PilotSafetyCheck[]): { goNoGo: "GO" | "NO-GO"; reason: string } {
  const failed = checks.filter((check) => !check.passed);
  if (failed.length === 0) {
    return { goNoGo: "GO", reason: "All pilot safety gates satisfied." };
  }
  return {
    goNoGo: "NO-GO",
    reason: failed.map((check) => check.detail).join(" "),
  };
}
