const DROPBOX_SIGN_API_BASE = "https://api.hellosign.com/v3";
const DEFAULT_TIMEOUT_MS = 25_000;

export class DropboxSignError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status?: number, details?: unknown) {
    super(message);
    this.name = "DropboxSignError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DropboxSignConfig = {
  apiKey: string;
  clientId: string | null;
  testMode: boolean;
};

export type DropboxSignTemplateSummary = {
  templateId: string;
  title: string;
};

export type DropboxSignSignerInput = {
  role: string;
  name: string;
  emailAddress: string;
};

export type SendTemplateSignatureRequestInput = {
  templateId: string;
  signers: DropboxSignSignerInput[];
  title?: string;
  subject?: string;
  message?: string;
};

export type DropboxSignSignatureSummary = {
  signatureId: string;
  signerEmail: string;
  signerName: string;
  statusCode: string;
  lastViewedAt: string | null;
  signedAt: string | null;
};

export type DropboxSignRequestSummary = {
  signatureRequestId: string;
  isComplete: boolean;
  isDeclined: boolean;
  signatures: DropboxSignSignatureSummary[];
  rawStatus: string;
};

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    !value ||
    lower === "placeholder" ||
    lower.startsWith("your-") ||
    lower.includes("example")
  );
}

export function readDropboxSignConfig(): DropboxSignConfig | null {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY?.trim() ?? "";
  if (!apiKey || isPlaceholder(apiKey)) return null;
  const clientIdRaw = process.env.DROPBOX_SIGN_CLIENT_ID?.trim() ?? "";
  const clientId = clientIdRaw && !isPlaceholder(clientIdRaw) ? clientIdRaw : null;
  const testMode =
    process.env.DROPBOX_SIGN_TEST_MODE?.trim().toLowerCase() === "true" ||
    process.env.NODE_ENV !== "production";
  return { apiKey, clientId, testMode };
}

export function requireDropboxSignConfig(): DropboxSignConfig {
  const config = readDropboxSignConfig();
  if (!config) {
    throw new DropboxSignError(
      "DROPBOX_SIGN_API_KEY is not configured. Add it to .env.local for the SRS Recruiting Operations Dropbox Sign app.",
      "missing_api_key",
      503,
    );
  }
  return config;
}

function authHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${token}`;
}

async function dropboxSignFetch<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const config = requireDropboxSignConfig();
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", authHeader(config.apiKey));
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${DROPBOX_SIGN_API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { raw: text };
      }
    }

    if (!response.ok) {
      const errBody = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const apiError =
        typeof errBody.error === "object" && errBody.error && "error_msg" in (errBody.error as object)
          ? String((errBody.error as { error_msg?: string }).error_msg)
          : typeof errBody.error === "string"
            ? errBody.error
            : response.statusText;
      throw new DropboxSignError(
        apiError || `Dropbox Sign request failed (${response.status})`,
        "api_error",
        response.status,
        parsed,
      );
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof DropboxSignError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new DropboxSignError("Dropbox Sign request timed out.", "timeout", 504);
    }
    throw new DropboxSignError(
      error instanceof Error ? error.message : "Dropbox Sign request failed.",
      "network_error",
    );
  } finally {
    clearTimeout(timer);
  }
}

type ApiTemplateListResponse = {
  templates?: Array<{ template_id?: string; title?: string }>;
};

type ApiSignatureRequestResponse = {
  signature_request?: {
    signature_request_id?: string;
    is_complete?: boolean;
    is_declined?: boolean;
    signatures?: Array<{
      signature_id?: string;
      signer_email_address?: string;
      signer_name?: string;
      status_code?: string;
      last_viewed_at?: number | null;
      signed_at?: number | null;
    }>;
  };
};

function mapSignatureRequest(raw: ApiSignatureRequestResponse["signature_request"]): DropboxSignRequestSummary {
  const signatures = (raw?.signatures ?? []).map((sig) => ({
    signatureId: sig.signature_id ?? "",
    signerEmail: sig.signer_email_address ?? "",
    signerName: sig.signer_name ?? "",
    statusCode: sig.status_code ?? "awaiting_signature",
    lastViewedAt: sig.last_viewed_at ? new Date(sig.last_viewed_at * 1000).toISOString() : null,
    signedAt: sig.signed_at ? new Date(sig.signed_at * 1000).toISOString() : null,
  }));
  const isComplete = Boolean(raw?.is_complete);
  const isDeclined = Boolean(raw?.is_declined);
  let rawStatus = "pending";
  if (isComplete) rawStatus = "complete";
  else if (isDeclined) rawStatus = "declined";
  else if (signatures.some((s) => s.statusCode === "signed")) rawStatus = "partially_signed";
  else if (signatures.some((s) => s.lastViewedAt)) rawStatus = "viewed";

  return {
    signatureRequestId: raw?.signature_request_id ?? "",
    isComplete,
    isDeclined,
    signatures,
    rawStatus,
  };
}

export async function listTemplates(): Promise<DropboxSignTemplateSummary[]> {
  const data = await dropboxSignFetch<ApiTemplateListResponse>("/template/list?page=1&page_size=100");
  return (data.templates ?? [])
    .filter((t) => t.template_id)
    .map((t) => ({
      templateId: t.template_id!,
      title: t.title?.trim() || t.template_id!,
    }));
}

function normalizeSignerForApi(signer: DropboxSignSignerInput): {
  role: string;
  name: string;
  email_address: string;
} | null {
  const role = signer.role?.trim() ?? "";
  const name = signer.name?.trim() ?? "";
  const email = signer.emailAddress?.trim().toLowerCase() ?? "";
  if (!role || !name || !email || !email.includes("@")) return null;
  return { role, name, email_address: email };
}

export async function sendTemplateSignatureRequest(
  input: SendTemplateSignatureRequestInput,
): Promise<DropboxSignRequestSummary> {
  const config = requireDropboxSignConfig();
  const signers = input.signers
    .map((signer) => normalizeSignerForApi(signer))
    .filter((signer): signer is { role: string; name: string; email_address: string } => signer !== null);

  if (signers.length === 0) {
    throw new DropboxSignError(
      "No recipients specified. Provide a valid signer role, name, and email_address.",
      "missing_recipients",
      400,
    );
  }

  const body: Record<string, unknown> = {
    template_ids: [input.templateId],
    signers,
    test_mode: config.testMode,
  };
  if (config.clientId) body.client_id = config.clientId;
  if (input.title?.trim()) body.title = input.title.trim();
  if (input.subject?.trim()) body.subject = input.subject.trim();
  if (input.message?.trim()) body.message = input.message.trim();

  const data = await dropboxSignFetch<ApiSignatureRequestResponse>("/signature_request/send_with_template", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const summary = mapSignatureRequest(data.signature_request);
  if (!summary.signatureRequestId) {
    throw new DropboxSignError("Dropbox Sign did not return a signature request id.", "invalid_response", 502, data);
  }
  return summary;
}

export async function getSignatureRequest(signatureRequestId: string): Promise<DropboxSignRequestSummary> {
  const data = await dropboxSignFetch<ApiSignatureRequestResponse>(
    `/signature_request/${encodeURIComponent(signatureRequestId)}`,
  );
  const summary = mapSignatureRequest(data.signature_request);
  if (!summary.signatureRequestId) {
    throw new DropboxSignError("Signature request not found.", "not_found", 404, data);
  }
  return summary;
}
