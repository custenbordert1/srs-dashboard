import { readDropboxSignConfig, requireDropboxSignConfig } from "@/lib/dropbox-sign";
import { assertLivePilotEnvForExecute } from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import {
  applyP192ProductionDropboxEnv,
  assertProductionTestModeOff,
  readP192DropboxTestMode,
} from "@/lib/p192-supervised-paperwork-runner/productionMode";
import {
  P256_CONFIRMATION_PHRASE,
  type P256ProductionPreflight,
  type P256QuotaSnapshot,
} from "@/lib/p256-controlled-live-recovered-send/types";

export async function probeP256AccountQuota(apiKey?: string): Promise<P256QuotaSnapshot> {
  const probedAt = new Date().toISOString();
  const key = apiKey ?? readDropboxSignConfig()?.apiKey;
  if (!key) {
    return {
      accountQuotaRemaining: null,
      rateLimitRemaining: null,
      probedAt,
      error: "DROPBOX_SIGN_API_KEY missing",
    };
  }

  const token = Buffer.from(`${key}:`).toString("base64");
  try {
    const response = await fetch("https://api.hellosign.com/v3/account", {
      method: "GET",
      headers: { Authorization: `Basic ${token}` },
    });
    const rateLimitRemainingRaw =
      response.headers.get("x-ratelimit-limit-remaining") ??
      response.headers.get("X-Ratelimit-Limit-Remaining");
    const rateLimitRemaining =
      rateLimitRemainingRaw != null && Number.isFinite(Number.parseInt(rateLimitRemainingRaw, 10))
        ? Number.parseInt(rateLimitRemainingRaw, 10)
        : null;
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      return {
        accountQuotaRemaining: null,
        rateLimitRemaining,
        probedAt,
        error: `GET /account failed (${response.status})`,
      };
    }
    const account =
      body && typeof body === "object" && body !== null && "account" in body
        ? (
            body as {
              account?: {
                quotas?: { api_signature_requests_left?: number };
              };
            }
          ).account
        : undefined;
    const remaining =
      typeof account?.quotas?.api_signature_requests_left === "number"
        ? account.quotas.api_signature_requests_left
        : null;
    return {
      accountQuotaRemaining: remaining,
      rateLimitRemaining,
      probedAt,
      error: null,
    };
  } catch (error) {
    return {
      accountQuotaRemaining: null,
      rateLimitRemaining: null,
      probedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Fail-closed production Dropbox preflight for P256.
 * Never falls back to testMode. Aborts when production quota is 0/unknown.
 */
export async function runP256ProductionPreflight(input: {
  confirmationPhrase: string;
  requireLivePilotEnv?: boolean;
}): Promise<P256ProductionPreflight> {
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

  const confirmationPhraseOk =
    input.confirmationPhrase.trim() === P256_CONFIRMATION_PHRASE ||
    input.confirmationPhrase.trim() === P122_CONFIRMATION_PHRASE;
  if (!confirmationPhraseOk) {
    blockers.push(
      `Confirmation phrase must be exactly "${P256_CONFIRMATION_PHRASE}" (got "${input.confirmationPhrase.trim()}").`,
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
