import { createHmac, timingSafeEqual } from "node:crypto";

export const DROPBOX_SIGN_WEBHOOK_ACK = "Hello API Event Received";

const HANDLED_EVENT_TYPES = new Set([
  "signature_request_viewed",
  "signature_request_signed",
  "signature_request_all_signed",
]);

export type DropboxSignWebhookEvent = {
  event_time: string;
  event_type: string;
  event_hash: string;
};

export type DropboxSignWebhookPayload = {
  event: DropboxSignWebhookEvent;
  signature_request?: {
    signature_request_id?: string;
  };
};

export function isHandledDropboxSignEventType(eventType: string): boolean {
  return HANDLED_EVENT_TYPES.has(eventType);
}

export function verifyDropboxSignEventHash(
  apiKey: string,
  event: Pick<DropboxSignWebhookEvent, "event_time" | "event_type" | "event_hash">,
): boolean {
  const key = apiKey.trim();
  if (!key || !event.event_hash || !event.event_time || !event.event_type) return false;
  const expected = createHmac("sha256", key)
    .update(`${event.event_time}${event.event_type}`)
    .digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(event.event_hash, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function parseDropboxSignWebhookBody(raw: unknown): DropboxSignWebhookPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const eventRaw = body.event;
  if (!eventRaw || typeof eventRaw !== "object") return null;
  const eventObj = eventRaw as Record<string, unknown>;
  const event_time = typeof eventObj.event_time === "string" ? eventObj.event_time : "";
  const event_type = typeof eventObj.event_type === "string" ? eventObj.event_type : "";
  const event_hash = typeof eventObj.event_hash === "string" ? eventObj.event_hash : "";
  if (!event_time || !event_type || !event_hash) return null;

  let signature_request_id: string | undefined;
  const sigRaw = body.signature_request;
  if (sigRaw && typeof sigRaw === "object") {
    const id = (sigRaw as { signature_request_id?: unknown }).signature_request_id;
    if (typeof id === "string" && id.trim()) signature_request_id = id.trim();
  }

  return {
    event: { event_time, event_type, event_hash },
    signature_request: signature_request_id
      ? { signature_request_id }
      : undefined,
  };
}

/** Optional shared secret (Bearer or X-Dropbox-Sign-Webhook-Secret) when DROPBOX_SIGN_WEBHOOK_SECRET is set. */
export function verifyDropboxSignWebhookSecret(request: Request): boolean {
  const expected = process.env.DROPBOX_SIGN_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const header = request.headers.get("x-dropbox-sign-webhook-secret")?.trim() ?? null;
  return bearer === expected || header === expected;
}

export async function readDropboxSignWebhookPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const jsonField = form.get("json");
    if (typeof jsonField === "string") {
      try {
        return JSON.parse(jsonField) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}
