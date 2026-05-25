import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  isHandledDropboxSignEventType,
  parseDropboxSignWebhookBody,
  verifyDropboxSignEventHash,
} from "@/lib/dropbox-sign-webhook";

function buildSignedPayload(apiKey: string) {
  const event_time = "1716650000";
  const event_type = "signature_request_signed";
  const event_hash = createHmac("sha256", apiKey)
    .update(`${event_time}${event_type}`)
    .digest("hex");
  return {
    event: { event_time, event_type, event_hash },
    signature_request: { signature_request_id: "sig-webhook-test-1" },
  };
}

describe("dropbox-sign-webhook", () => {
  it("recognizes handled event types", () => {
    assert.equal(isHandledDropboxSignEventType("signature_request_viewed"), true);
    assert.equal(isHandledDropboxSignEventType("signature_request_signed"), true);
    assert.equal(isHandledDropboxSignEventType("signature_request_sent"), false);
  });

  it("verifies event hash with API key", () => {
    const apiKey = "test-api-key-primary";
    const payload = buildSignedPayload(apiKey);
    assert.equal(verifyDropboxSignEventHash(apiKey, payload.event), true);
    assert.equal(verifyDropboxSignEventHash("wrong-key", payload.event), false);
  });

  it("parses webhook JSON body", () => {
    const apiKey = "test-api-key-primary";
    const payload = buildSignedPayload(apiKey);
    const parsed = parseDropboxSignWebhookBody(payload);
    assert.ok(parsed);
    assert.equal(parsed?.event.event_type, "signature_request_signed");
    assert.equal(parsed?.signature_request?.signature_request_id, "sig-webhook-test-1");
  });
});
