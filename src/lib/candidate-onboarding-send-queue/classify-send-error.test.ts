import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DropboxSignError } from "@/lib/dropbox-sign";
import {
  computeRetryDelayMs,
  isTransientSendError,
} from "@/lib/candidate-onboarding-send-queue/classify-send-error";

describe("classify-send-error", () => {
  it("treats Dropbox 429 as transient", () => {
    const error = new DropboxSignError("Too many requests", "api_error", 429);
    assert.equal(isTransientSendError({ error }), true);
  });

  it("treats Dropbox 502 rate limit message as transient", () => {
    const error = new DropboxSignError(
      "Too many requests. System limits for test requests are 10 per minute.",
      "api_error",
      502,
    );
    assert.equal(isTransientSendError({ error }), true);
  });

  it("treats timeout as transient", () => {
    const error = new DropboxSignError("Request timed out", "timeout");
    assert.equal(isTransientSendError({ error }), true);
  });

  it("does not retry validation failures", () => {
    const error = new DropboxSignError("Invalid email", "validation_error", 400);
    assert.equal(isTransientSendError({ error }), false);
  });

  it("uses exponential backoff delays", () => {
    assert.equal(computeRetryDelayMs(1, 30_000), 30_000);
    assert.equal(computeRetryDelayMs(2, 30_000), 60_000);
    assert.equal(computeRetryDelayMs(3, 30_000), 120_000);
  });
});
