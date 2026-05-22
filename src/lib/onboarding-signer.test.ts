import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTemplateSignerPayload,
  candidatePrimaryEmail,
  maskEmailForLog,
  normalizePrimaryEmail,
} from "@/lib/onboarding-signer";

describe("onboarding-signer", () => {
  it("normalizes email from Breezy email_address alias", () => {
    assert.equal(normalizePrimaryEmail("", "Pat@Example.com"), "pat@example.com");
  });

  it("reads primary email from candidate row shape", () => {
    assert.equal(
      candidatePrimaryEmail({ email: "", email_address: "hire@example.com" }),
      "hire@example.com",
    );
  });

  it("builds signer payload with email_address for Dropbox Sign", () => {
    const built = buildTemplateSignerPayload({
      templateKey: "onboarding_packet",
      candidateName: "Pat Lee",
      emailSources: ["hire@example.com"],
    });
    assert.equal(built.ok, true);
    if (built.ok) {
      assert.equal(built.signer.emailAddress, "hire@example.com");
      assert.ok(built.signer.role.length > 0);
      assert.equal(built.signer.name, "Pat Lee");
    }
  });

  it("masks email for safe logging", () => {
    assert.equal(maskEmailForLog("pat.lee@example.com"), "p***e@example.com");
  });
});
