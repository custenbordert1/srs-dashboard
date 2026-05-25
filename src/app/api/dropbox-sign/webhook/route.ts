import {
  DROPBOX_SIGN_WEBHOOK_ACK,
  isHandledDropboxSignEventType,
  parseDropboxSignWebhookBody,
  readDropboxSignWebhookPayload,
  verifyDropboxSignEventHash,
  verifyDropboxSignWebhookSecret,
} from "@/lib/dropbox-sign-webhook";
import { handleDropboxSignWebhookEvent } from "@/lib/dropbox-sign-webhook-handler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** No guardApiRoute — Dropbox Sign servers call this without a recruiter session. */

function webhookSkipVerify(): boolean {
  return process.env.DROPBOX_SIGN_WEBHOOK_SKIP_VERIFY?.trim().toLowerCase() === "true";
}

export async function POST(request: Request) {
  if (!verifyDropboxSignWebhookSecret(request)) {
    console.warn("[dropbox-sign-webhook] invalid_webhook_secret");
    return new NextResponse("Invalid webhook secret", { status: 401 });
  }

  const raw = await readDropboxSignWebhookPayload(request);
  const payload = parseDropboxSignWebhookBody(raw);

  if (!payload) {
    console.warn("[dropbox-sign-webhook] invalid_payload");
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const eventType = payload.event.event_type;
  const signatureRequestId = payload.signature_request?.signature_request_id ?? null;

  const apiKey = process.env.DROPBOX_SIGN_API_KEY?.trim() ?? "";
  if (!webhookSkipVerify()) {
    if (!apiKey) {
      console.error("[dropbox-sign-webhook] missing_api_key_for_verification");
      return new NextResponse("Webhook verification unavailable", { status: 503 });
    }
    if (!verifyDropboxSignEventHash(apiKey, payload.event)) {
      console.warn("[dropbox-sign-webhook] invalid_event_hash", {
        eventType,
        signatureRequestId: signatureRequestId ? "[redacted]" : null,
      });
      return new NextResponse("Invalid event hash", { status: 401 });
    }
  }

  console.info("[dropbox-sign-webhook]", {
    eventType,
    handledType: isHandledDropboxSignEventType(eventType),
    signatureRequestId: signatureRequestId ? "[redacted]" : null,
    receivedAt: new Date().toISOString(),
  });

  if (isHandledDropboxSignEventType(eventType)) {
    try {
      const result = await handleDropboxSignWebhookEvent(payload);
      if (result.skipped) {
        console.warn("[dropbox-sign-webhook] skipped", {
          eventType,
          reason: result.skipped,
          candidateId: result.candidateId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook handler failed";
      console.error("[dropbox-sign-webhook] handler_error", { eventType, message });
      return new NextResponse("Handler error", { status: 500 });
    }
  }

  return new NextResponse(DROPBOX_SIGN_WEBHOOK_ACK, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
