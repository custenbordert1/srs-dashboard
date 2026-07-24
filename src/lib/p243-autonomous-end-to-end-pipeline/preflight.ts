import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { probeP185StorageConnectivity } from "@/lib/p185-production-paperwork-automation-runner";
import type { P243PreflightCheck } from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import {
  LIVE_PILOT_ENV_EXPORT_BLOCK,
  inspectLivePilotEnv,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";

/**
 * Live-mode preflight checklist. Dry-run always passes with informational checks
 * (including storage warnings). Dropbox / confirmLive / storage soft-fail only
 * block live execute (caller falls back to dry-run planning).
 */
export async function runP243Preflight(input: {
  dryRun: boolean;
  confirmLive: boolean;
  fullLive: boolean;
  canaryLimit: number;
  confirmationPhrase?: string;
}): Promise<{ ok: boolean; checks: P243PreflightCheck[]; executionBlockedReason: string | null }> {
  const checks: P243PreflightCheck[] = [];

  checks.push({
    id: "mode",
    ok: true,
    message: input.dryRun
      ? "Dry-run mode — no Dropbox/Breezy writes"
      : input.fullLive
        ? `Full live requested (canaryLimit ignored; confirmLive=${input.confirmLive})`
        : `Canary live (max ${input.canaryLimit} sends); confirmLive=${input.confirmLive}`,
  });

  const dropbox = readDropboxSignConfig();
  const dropboxConfigured = Boolean(dropbox);
  checks.push({
    id: "dropbox_config",
    ok: input.dryRun ? true : dropboxConfigured,
    message: dropbox
      ? `Dropbox Sign configured (testMode=${dropbox.testMode})`
      : input.dryRun
        ? "Dropbox Sign not configured (informational in dry-run)"
        : "Dropbox Sign not configured (API key missing)",
  });

  if (!input.dryRun && dropbox && dropbox.testMode !== true) {
    checks.push({
      id: "dropbox_test_mode",
      ok: false,
      message: "Live P243 requires Dropbox testMode=true until production-mode is separately authorized",
    });
  } else {
    checks.push({
      id: "dropbox_test_mode",
      ok: true,
      message: dropbox
        ? `Dropbox testMode=${dropbox.testMode}`
        : input.dryRun
          ? "N/A (dry-run)"
          : "Dropbox testMode check skipped (config missing)",
    });
  }

  const pilot = loadPilotConfig();
  const pilotEnv = inspectLivePilotEnv();
  checks.push({
    id: "paperwork_pilot",
    ok: true,
    message: `P122 pilot allowlist size=${pilot.allowlist.length} liveMode=${pilot.liveModeEnabled} pilotEnabled=${pilot.pilotEnabled} operatorGo=${pilot.operatorGo} (P123 still enforces gates)`,
  });

  if (!input.dryRun) {
    checks.push({
      id: "pilot_live_env",
      ok: pilotEnv.ok,
      message: pilotEnv.ok
        ? "Pilot env OK: LIVE_PILOT_ENABLED + LIVE_MODE + OPERATOR_GO are true"
        : `Missing pilot env: ${pilotEnv.missing.join(", ")}. Export:\n${LIVE_PILOT_ENV_EXPORT_BLOCK}`,
    });
  } else {
    checks.push({
      id: "pilot_live_env",
      ok: true,
      message: pilotEnv.ok
        ? "Pilot env present (informational in dry-run)"
        : `Pilot env not set (informational in dry-run): ${pilotEnv.missing.join(", ") || "n/a"}`,
    });
  }

  const phrase = input.confirmationPhrase?.trim();
  if (!input.dryRun) {
    checks.push({
      id: "confirmation_phrase",
      ok: phrase === P122_CONFIRMATION_PHRASE,
      message:
        phrase === P122_CONFIRMATION_PHRASE
          ? `Confirmation phrase verified: ${P122_CONFIRMATION_PHRASE}`
          : `Live execute requires confirmationPhrase="${P122_CONFIRMATION_PHRASE}" (open-stores auto-injects with --live --confirm-live)`,
    });
  } else {
    checks.push({
      id: "confirmation_phrase",
      ok: true,
      message: "N/A (dry-run)",
    });
  }

  checks.push({
    id: "onboarding_template",
    ok: true,
    message: "Onboarding template key expected: onboarding_packet (resolved at send time)",
  });

  if (!input.dryRun && !input.confirmLive) {
    checks.push({
      id: "confirm_live",
      ok: false,
      message: "Live execute requires confirmLive=true",
    });
  } else {
    checks.push({
      id: "confirm_live",
      ok: true,
      message: input.dryRun ? "N/A (dry-run)" : "confirmLive acknowledged",
    });
  }

  // Option A: Neon/Postgres (P185.5) is the preferred durable path for P184/P185/P243.
  const storage = await probeP185StorageConnectivity();
  if (input.dryRun) {
    // Never hard-block dry-run — surface FS fallback or connectivity issues as warnings.
    checks.push({
      id: "durable_storage",
      ok: true,
      message: storage.configuredPostgres
        ? storage.connectivityOk
          ? storage.detail
          : `WARNING: ${storage.detail} — dry-run continues; fix Neon connectivity before live`
        : `WARNING: Neon/Postgres (P185.5) not configured — ${storage.detail}`,
    });
  } else {
    const liveStorageOk = storage.configuredPostgres && storage.connectivityOk === true;
    checks.push({
      id: "durable_storage",
      ok: liveStorageOk,
      message: liveStorageOk
        ? storage.detail
        : storage.configuredPostgres
          ? `Live soft-fail: ${storage.detail}`
          : `Live soft-fail: Neon/Postgres (P185.5) required for live. Set P185_DATABASE_URL / DATABASE_URL / POSTGRES_URL. Currently adapter=${storage.adapter}.`,
    });
  }

  const blocking = checks.filter((c) => !c.ok);
  return {
    ok: blocking.length === 0,
    checks,
    executionBlockedReason: blocking[0]?.message ?? null,
  };
}
