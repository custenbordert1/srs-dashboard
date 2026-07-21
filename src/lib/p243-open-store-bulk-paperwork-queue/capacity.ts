import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api/metrics";
import {
  P243_OSBPQ_DEFAULT_SAFE_SEND_CAP,
  P243_OSBPQ_SAFETY_RESERVE,
  type P243OsbpqCapacityProbe,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

function readConfiguredCap(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.DROPBOX_SIGN_SAFE_SEND_CAP?.trim();
  if (!raw) return P243_OSBPQ_DEFAULT_SAFE_SEND_CAP;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : P243_OSBPQ_DEFAULT_SAFE_SEND_CAP;
}

async function probeAccountQuota(apiKey: string): Promise<{
  remaining: number | null;
  email: string | null;
  rateLimitRemaining: number | null;
  error: string | null;
}> {
  const token = Buffer.from(`${apiKey}:`).toString("base64");
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
        remaining: null,
        email: null,
        rateLimitRemaining,
        error: `GET /account failed (${response.status})`,
      };
    }
    const account =
      body && typeof body === "object" && body !== null && "account" in body
        ? (
            body as {
              account?: {
                email_address?: string;
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
      remaining,
      email: account?.email_address ?? null,
      rateLimitRemaining,
      error: null,
    };
  } catch (error) {
    return {
      remaining: null,
      email: null,
      rateLimitRemaining: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Best-effort Dropbox capacity probe.
 * Prefer account quota (api_signature_requests_left); fall back to rate-limit
 * headers and DROPBOX_SIGN_SAFE_SEND_CAP. If nothing confirms remaining,
 * stopAfterPreview=true (preview-only).
 */
export async function probeDropboxSendCapacity(input?: {
  safetyReserve?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<P243OsbpqCapacityProbe> {
  const env = input?.env ?? process.env;
  const safetyReserve = input?.safetyReserve ?? P243_OSBPQ_SAFETY_RESERVE;
  const configuredSafeSendCap = readConfiguredCap(env);
  const limitationNotes: string[] = [];
  const metrics = getDropboxSignApiMetricsSnapshot();
  const inFlightLocal = metrics.requestsPerMinute;

  const cfg = readDropboxSignConfig();
  if (!cfg) {
    return {
      probedAt: new Date().toISOString(),
      confirmed: false,
      source: "unconfirmed",
      apiRequestsRemaining: null,
      rateLimitRemaining: metrics.rateLimitRemaining,
      inFlightLocal,
      safetyReserve,
      configuredSafeSendCap,
      safeCapacity: null,
      stopAfterPreview: true,
      limitationNotes: [
        "Dropbox Sign API key missing — capacity cannot be confirmed.",
        "Dropbox Sign does not always expose a clear remaining send budget; use DROPBOX_SIGN_SAFE_SEND_CAP.",
      ],
      accountEmail: null,
      detail: "misconfigured",
    };
  }

  const account = await probeAccountQuota(cfg.apiKey);
  if (account.error) {
    limitationNotes.push(`Account probe error: ${account.error}`);
  }

  const rateLimitRemaining = account.rateLimitRemaining ?? metrics.rateLimitRemaining;
  const testMode = cfg.testMode === true;

  // Prefer account quota when present; otherwise configured cap (conservative).
  // Note: HelloSign account quotas often apply to production signature requests;
  // testMode sends may not decrement the same counter — still treat as budget signal.
  // When production quota is 0/null but testMode is enabled, fall back to configured
  // DROPBOX_SIGN_SAFE_SEND_CAP so test-mode bulk sends can proceed safely.
  let apiRequestsRemaining = account.remaining;
  let source: P243OsbpqCapacityProbe["source"] = "unconfirmed";
  let confirmed = false;

  if (
    testMode &&
    (apiRequestsRemaining == null || apiRequestsRemaining <= 0) &&
    configuredSafeSendCap != null
  ) {
    apiRequestsRemaining = configuredSafeSendCap;
    source = "configured_cap";
    confirmed = true;
    limitationNotes.push(
      `Production account quota=${account.remaining ?? "null"} but Dropbox testMode=true — ` +
        `using DROPBOX_SIGN_SAFE_SEND_CAP=${configuredSafeSendCap} as conservative test-mode capacity.`,
    );
  } else if (apiRequestsRemaining != null && Number.isFinite(apiRequestsRemaining) && apiRequestsRemaining > 0) {
    source = "account_quota";
    confirmed = true;
  } else if (rateLimitRemaining != null && Number.isFinite(rateLimitRemaining) && rateLimitRemaining > 0) {
    apiRequestsRemaining = rateLimitRemaining;
    source = "rate_limit_header";
    confirmed = true;
    limitationNotes.push(
      "Using rate-limit remaining header as capacity proxy (account quota unavailable).",
    );
  } else if (configuredSafeSendCap != null) {
    apiRequestsRemaining = configuredSafeSendCap;
    source = "configured_cap";
    confirmed = true;
    limitationNotes.push(
      "Dropbox API did not expose a usable remaining quota — using DROPBOX_SIGN_SAFE_SEND_CAP " +
        `(or default ${P243_OSBPQ_DEFAULT_SAFE_SEND_CAP}) as conservative capacity.`,
    );
  } else {
    limitationNotes.push(
      "Capacity unconfirmed — stopping after preview only. Set DROPBOX_SIGN_SAFE_SEND_CAP to proceed conservatively.",
    );
  }

  // Still clamp by configured cap when both are known (non-test fallback path)
  if (
    confirmed &&
    configuredSafeSendCap != null &&
    apiRequestsRemaining != null &&
    source === "account_quota"
  ) {
    if (apiRequestsRemaining > configuredSafeSendCap) {
      limitationNotes.push(
        `Clamping remaining ${apiRequestsRemaining} to DROPBOX_SIGN_SAFE_SEND_CAP=${configuredSafeSendCap}.`,
      );
      apiRequestsRemaining = configuredSafeSendCap;
    }
  }

  const rawSafe =
    confirmed && apiRequestsRemaining != null
      ? Math.max(0, apiRequestsRemaining - safetyReserve)
      : null;

  // Subtract local in-flight pressure (best-effort)
  const safeCapacity =
    rawSafe == null ? null : Math.max(0, rawSafe - Math.min(inFlightLocal, safetyReserve));

  const stopAfterPreview = !confirmed || safeCapacity == null;

  return {
    probedAt: new Date().toISOString(),
    confirmed,
    source,
    apiRequestsRemaining,
    rateLimitRemaining,
    inFlightLocal,
    safetyReserve,
    configuredSafeSendCap,
    safeCapacity,
    stopAfterPreview,
    limitationNotes,
    accountEmail: account.email,
    detail: stopAfterPreview
      ? "Capacity unconfirmed — preview only"
      : `Safe capacity=${safeCapacity} (remaining=${apiRequestsRemaining} − reserve=${safetyReserve}; source=${source})`,
  };
}

export function isCapacityExhausted(
  capacity: P243OsbpqCapacityProbe,
  alreadySentThisRun: number,
): boolean {
  if (!capacity.confirmed || capacity.safeCapacity == null) return true;
  // Stop when remaining headroom would hit the reserve (capacity == reserve → safeCapacity 0)
  return alreadySentThisRun >= capacity.safeCapacity;
}
