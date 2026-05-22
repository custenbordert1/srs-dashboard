import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Phase 1 placeholder — logs events only; status polling drives workflow updates. */
export async function POST(request: Request) {
  let eventType = "unknown";
  let signatureRequestId: string | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const jsonField = form.get("json");
      if (typeof jsonField === "string") {
        const parsed = JSON.parse(jsonField) as {
          event?: { event_type?: string; event_metadata?: { related_signature_id?: string } };
          signature_request?: { signature_request_id?: string };
        };
        eventType = parsed.event?.event_type ?? eventType;
        signatureRequestId =
          parsed.signature_request?.signature_request_id ??
          parsed.event?.event_metadata?.related_signature_id ??
          null;
      }
    } else {
      const body = (await request.json()) as {
        event?: { event_type?: string };
        signature_request?: { signature_request_id?: string };
      };
      eventType = body.event?.event_type ?? eventType;
      signatureRequestId = body.signature_request?.signature_request_id ?? null;
    }
  } catch {
    // Accept webhook without failing Dropbox Sign retries.
  }

  console.info("[dropbox-sign-webhook]", {
    eventType,
    signatureRequestId: signatureRequestId ? "[redacted]" : null,
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, received: true, eventType });
}
