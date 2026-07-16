import { createHash } from "node:crypto";
import { DropboxSignError, listTemplates, readDropboxSignConfig } from "@/lib/dropbox-sign";
import { withDropboxRecovery } from "@/lib/p207-autonomous-readiness-dashboard/dropboxRecovery";
import type { P207DropboxDiagnostics } from "@/lib/p207-autonomous-readiness-dashboard/types";

export type P207DropboxDiagnosticsBase = Omit<
  P207DropboxDiagnostics,
  "recoveryState" | "previousQuota" | "quotaRestoredRecommendP206"
>;

async function dropboxGetAccount(apiKey: string): Promise<{
  email: string | null;
  accountId: string | null;
  apiSignatureRequestsLeft: number | null;
  isPaidHs: boolean | null;
}> {
  const token = Buffer.from(`${apiKey}:`).toString("base64");
  const response = await fetch("https://api.hellosign.com/v3/account", {
    method: "GET",
    headers: { Authorization: `Basic ${token}` },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const errObj =
      body && typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { error_msg?: string; error_name?: string } }).error
        : null;
    throw new DropboxSignError(
      errObj?.error_msg || `Dropbox GET /account failed (${response.status})`,
      errObj?.error_name || "api_error",
      response.status,
      body,
    );
  }
  const account =
    body && typeof body === "object" && body !== null && "account" in body
      ? (body as {
          account?: {
            email_address?: string;
            account_id?: string;
            is_paid_hs?: boolean;
            quotas?: { api_signature_requests_left?: number };
          };
        }).account
      : undefined;
  return {
    email: account?.email_address ?? null,
    accountId: account?.account_id ?? null,
    apiSignatureRequestsLeft:
      typeof account?.quotas?.api_signature_requests_left === "number"
        ? account.quotas.api_signature_requests_left
        : null,
    isPaidHs: typeof account?.is_paid_hs === "boolean" ? account.is_paid_hs : null,
  };
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function readExplicitTestMode(): boolean | null {
  const raw = process.env.DROPBOX_SIGN_TEST_MODE?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

/**
 * Read-only Dropbox Sign diagnostics. Never creates signature requests.
 */
export async function loadP207DropboxDiagnosticsBase(input?: {
  override?: P207DropboxDiagnosticsBase | null;
  skipLive?: boolean;
  lastSuccessfulSendAt?: string | null;
  lastFailedSendAt?: string | null;
}): Promise<P207DropboxDiagnosticsBase> {
  if (input?.override) return input.override;

  const cfg = readDropboxSignConfig();
  const explicitTestMode = readExplicitTestMode();
  if (!cfg) {
    return {
      productionQuota: null,
      testMode: explicitTestMode,
      apiStatus: "unknown",
      lastSuccessfulSendAt: input?.lastSuccessfulSendAt ?? null,
      lastFailedSendAt: input?.lastFailedSendAt ?? null,
      templatesAvailable: null,
      accountEmail: null,
      accountIdHash: null,
      configurationStatus: "misconfigured",
      softwareReady: false,
      vendorBlocked: false,
      detail: "Dropbox Sign API key / config missing",
    };
  }

  if (input?.skipLive) {
    return {
      productionQuota: null,
      testMode: explicitTestMode ?? false,
      apiStatus: "unknown",
      lastSuccessfulSendAt: input?.lastSuccessfulSendAt ?? null,
      lastFailedSendAt: input?.lastFailedSendAt ?? null,
      templatesAvailable: null,
      accountEmail: null,
      accountIdHash: null,
      configurationStatus: "unknown",
      softwareReady: explicitTestMode !== true,
      vendorBlocked: false,
      detail: "Live Dropbox probe skipped (software path assumed ready)",
    };
  }

  try {
    const account = await dropboxGetAccount(cfg.apiKey);
    let templatesAvailable: number | null = null;
    try {
      const templates = await listTemplates();
      templatesAvailable = Array.isArray(templates) ? templates.length : null;
    } catch {
      templatesAvailable = null;
    }

    const quota = account.apiSignatureRequestsLeft;
    const vendorBlocked = quota != null && quota <= 0;
    const testModeBlocked = explicitTestMode === true;
    const softwareReady = !testModeBlocked && Boolean(cfg.apiKey);
    const testMode = explicitTestMode ?? false;
    const configurationStatus = testModeBlocked
      ? "misconfigured"
      : vendorBlocked
        ? "vendor_blocked"
        : softwareReady
          ? "software_ready"
          : "unknown";

    return {
      productionQuota: quota,
      testMode,
      apiStatus: "ok",
      lastSuccessfulSendAt: input?.lastSuccessfulSendAt ?? null,
      lastFailedSendAt: input?.lastFailedSendAt ?? null,
      templatesAvailable,
      accountEmail: account.email,
      accountIdHash: account.accountId ? hashId(account.accountId) : null,
      configurationStatus,
      softwareReady,
      vendorBlocked,
      detail: vendorBlocked
        ? `Vendor blocked: production quota=${quota} (software ready=${softwareReady})`
        : testModeBlocked
          ? "Misconfigured: DROPBOX_SIGN_TEST_MODE=true"
          : `Software ready · quota=${quota ?? "unknown"} · account=${account.email ?? "unknown"}`,
    };
  } catch (err) {
    return {
      productionQuota: null,
      testMode: explicitTestMode,
      apiStatus: "error",
      lastSuccessfulSendAt: input?.lastSuccessfulSendAt ?? null,
      lastFailedSendAt: input?.lastFailedSendAt ?? null,
      templatesAvailable: null,
      accountEmail: null,
      accountIdHash: null,
      configurationStatus: "unknown",
      softwareReady: explicitTestMode !== true,
      vendorBlocked: false,
      detail: `Dropbox account probe failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function loadP207DropboxDiagnostics(input?: {
  override?: P207DropboxDiagnostics | null;
  skipLive?: boolean;
  lastSuccessfulSendAt?: string | null;
  lastFailedSendAt?: string | null;
  quotaHistory?: Parameters<typeof withDropboxRecovery>[1];
}): Promise<P207DropboxDiagnostics> {
  if (input?.override) return input.override;
  const base = await loadP207DropboxDiagnosticsBase(input);
  return withDropboxRecovery(base, input?.quotaHistory ?? null);
}

export function stubVendorBlockedDropbox(
  partial: Partial<P207DropboxDiagnostics> = {},
): P207DropboxDiagnostics {
  const base: P207DropboxDiagnosticsBase = {
    productionQuota: 0,
    testMode: false,
    apiStatus: "ok",
    lastSuccessfulSendAt: null,
    lastFailedSendAt: "2026-07-15T18:00:00.000Z",
    templatesAvailable: 12,
    accountEmail: "humanresource@srsmerchandising.com",
    accountIdHash: "stub-account",
    configurationStatus: "vendor_blocked",
    softwareReady: true,
    vendorBlocked: true,
    detail: "Vendor blocked: production quota=0 (software ready=true)",
  };
  return {
    ...withDropboxRecovery(base, {
      previousQuota: 0,
      lastObservedQuota: 0,
      pilotInProgress: false,
      productionSendHealthy: false,
    }),
    ...partial,
  };
}
