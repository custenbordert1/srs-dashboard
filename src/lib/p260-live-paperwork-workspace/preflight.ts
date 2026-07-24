import { readDropboxSignConfig, requireDropboxSignConfig } from "@/lib/dropbox-sign";
import { assertLivePilotEnvForExecute } from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { probeP256AccountQuota } from "@/lib/p256-controlled-live-recovered-send/preflight";
import {
  applyP192ProductionDropboxEnv,
  assertProductionTestModeOff,
  readP192DropboxTestMode,
} from "@/lib/p192-supervised-paperwork-runner/productionMode";
import {
  P260_CONFIRMATION_PHRASE,
  type P260ProductionPreflight,
} from "@/lib/p260-live-paperwork-workspace/types";
import { isP260ConfirmationPhrase } from "@/lib/p260-live-paperwork-workspace/confirmation";

/**
 * Fail-closed production Dropbox preflight for Job Command Center live send.
 * Reuses P256 account quota probe — never falls back to testMode.
 */
export async function runP260ProductionPreflight(input: {
  confirmationPhrase: string;
  requireLivePilotEnv?: boolean;
  /** When true, skip phrase check (preview-only probes). */
  allowMissingPhrase?: boolean;
}): Promise<P260ProductionPreflight> {
  const blockers: string[] = [];

  applyP192ProductionDropboxEnv();

  let livePilotEnvOk = false;
  try {
    if (input.requireLivePilotEnv !== false) {
      assertLivePilotEnvForExecute();
      livePilotEnvOk = true;
    } else {
      livePilotEnvOk = true;
    }
  } catch (error) {
    livePilotEnvOk = false;
    blockers.push(error instanceof Error ? error.message : String(error));
  }

  const confirmationPhraseOk = input.allowMissingPhrase
    ? true
    : isP260ConfirmationPhrase(input.confirmationPhrase);
  if (!confirmationPhraseOk) {
    blockers.push(
      `Confirmation phrase must be exactly "${P260_CONFIRMATION_PHRASE}" (got "${input.confirmationPhrase.trim()}").`,
    );
  }

  const cfg = readDropboxSignConfig();
  const apiKeyPresent = Boolean(cfg?.apiKey);
  if (!apiKeyPresent) {
    blockers.push("DROPBOX_SIGN_API_KEY is missing or placeholder.");
  }

  const templateConfigured = Boolean(
    process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET?.trim() ||
      process.env.DROPBOX_SIGN_TEMPLATE_ID?.trim(),
  );
  if (!templateConfigured) {
    blockers.push("DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET is not configured.");
  }

  const testGate = assertProductionTestModeOff();
  if (!testGate.ok) {
    blockers.push(testGate.detail);
  }

  let accountQuotaRemaining: number | null = null;
  let rateLimitRemaining: number | null = null;
  if (cfg?.apiKey) {
    const quota = await probeP256AccountQuota(cfg.apiKey);
    accountQuotaRemaining = quota.accountQuotaRemaining;
    rateLimitRemaining = quota.rateLimitRemaining;
    if (quota.error) {
      blockers.push(`Dropbox account probe failed: ${quota.error}`);
    } else if (quota.accountQuotaRemaining == null) {
      blockers.push(
        "Dropbox account did not return api_signature_requests_left — cannot confirm production capacity.",
      );
    } else if (quota.accountQuotaRemaining <= 0) {
      blockers.push(
        `Production Dropbox Sign quota is ${quota.accountQuotaRemaining} (api_signature_requests_left). Live production packet creation is blocked — do not fall back to testMode.`,
      );
    }
  }

  try {
    requireDropboxSignConfig();
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }

  const productionModeConfirmed =
    testGate.ok && testGate.testMode === false && readP192DropboxTestMode() === false;
  const ok =
    blockers.length === 0 &&
    productionModeConfirmed &&
    apiKeyPresent &&
    templateConfigured &&
    confirmationPhraseOk &&
    livePilotEnvOk &&
    accountQuotaRemaining != null &&
    accountQuotaRemaining > 0;

  return {
    ok,
    aborted: !ok,
    blockers,
    testMode: readP192DropboxTestMode(),
    productionModeConfirmed,
    apiKeyPresent,
    templateConfigured,
    accountQuotaRemaining,
    rateLimitRemaining,
    livePilotEnvOk,
    confirmationPhraseOk,
    detail: ok
      ? `Production Dropbox ready (testMode=false, quota=${accountQuotaRemaining}).`
      : `ABORTED — ${blockers.join(" | ")}`,
  };
}
