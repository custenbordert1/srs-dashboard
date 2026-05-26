import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DropboxSignError, readDropboxSignConfig, requireDropboxSignConfig } from "@/lib/dropbox-sign";

describe("dropbox-sign config", () => {
  it("returns null when API key is missing", () => {
    const prev = process.env.DROPBOX_SIGN_API_KEY;
    delete process.env.DROPBOX_SIGN_API_KEY;
    try {
      assert.equal(readDropboxSignConfig(), null);
    } finally {
      if (prev !== undefined) process.env.DROPBOX_SIGN_API_KEY = prev;
    }
  });

  it("throws structured error when API key required but missing", () => {
    const prev = process.env.DROPBOX_SIGN_API_KEY;
    delete process.env.DROPBOX_SIGN_API_KEY;
    try {
      assert.throws(
        () => requireDropboxSignConfig(),
        (err: unknown) => err instanceof DropboxSignError && (err as DropboxSignError).code === "missing_api_key",
      );
    } finally {
      if (prev !== undefined) process.env.DROPBOX_SIGN_API_KEY = prev;
    }
  });
});
