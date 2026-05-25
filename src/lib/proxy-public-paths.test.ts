import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DROPBOX_SIGN_WEBHOOK_PATH,
  isDropboxSignWebhookPath,
} from "../proxy";

describe("proxy public webhook paths", () => {
  it("treats Dropbox Sign webhook as public", () => {
    assert.equal(DROPBOX_SIGN_WEBHOOK_PATH, "/api/dropbox-sign/webhook");
    assert.equal(isDropboxSignWebhookPath("/api/dropbox-sign/webhook"), true);
    assert.equal(isDropboxSignWebhookPath("/api/dropbox-sign/webhook/"), true);
    assert.equal(isDropboxSignWebhookPath("/api/candidates/workflows"), false);
  });
});
