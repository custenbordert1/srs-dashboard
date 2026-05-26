import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasConfiguredOnboardingTemplates,
  isOnboardingTemplateKey,
  resolveTemplateId,
  validateSendPacketRequest,
} from "@/lib/onboarding-template-registry";

describe("onboarding-template-registry", () => {
  it("rejects unknown template keys", () => {
    assert.equal(isOnboardingTemplateKey("unknown"), false);
    const result = validateSendPacketRequest({
      candidateId: "c1",
      candidateName: "Pat Lee",
      candidateEmail: "pat@example.com",
      templateKey: "unknown",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Unknown templateKey/);
  });

  it("accepts Breezy email_address alias without candidateEmail", () => {
    const prev = process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = "template-abc123";
    try {
      const result = validateSendPacketRequest({
        candidateId: "c1",
        candidateName: "Pat Lee",
        email_address: "Pat@Example.com",
        templateKey: "onboarding_packet",
      });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.recipientEmail, "pat@example.com");
    } finally {
      if (prev !== undefined) process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = prev;
      else delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    }
  });

  it("requires all send-packet fields", () => {
    const result = validateSendPacketRequest({ candidateId: "c1" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.field, "candidateName");
  });

  it("fails when template env id is not configured", () => {
    const prev = process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    try {
      const result = validateSendPacketRequest({
        candidateId: "c1",
        candidateName: "Pat Lee",
        candidateEmail: "pat@example.com",
        templateKey: "onboarding_packet",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.error, /not configured/);
    } finally {
      if (prev !== undefined) process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = prev;
    }
  });

  it("reads onboarding packet from DROPOX typo alias env", () => {
    const canonical = process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    const typo = process.env.DROPOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    process.env.DROPOX_SIGN_TEMPLATE_ONBOARDING_PACKET = "template-from-typo";
    try {
      assert.equal(resolveTemplateId("onboarding_packet"), "template-from-typo");
      assert.equal(hasConfiguredOnboardingTemplates(), true);
    } finally {
      if (canonical !== undefined) process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = canonical;
      else delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
      if (typo !== undefined) process.env.DROPOX_SIGN_TEMPLATE_ONBOARDING_PACKET = typo;
      else delete process.env.DROPOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    }
  });

  it("accepts valid request when template env is set", () => {
    const prev = process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = "template-abc123";
    try {
      const result = validateSendPacketRequest({
        candidateId: "c1",
        candidateName: "Pat Lee",
        candidateEmail: "pat@example.com",
        templateKey: "onboarding_packet",
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.templateKey, "onboarding_packet");
        assert.equal(result.templateId, "template-abc123");
        assert.equal(result.recipientEmail, "pat@example.com");
      }
    } finally {
      if (prev !== undefined) process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = prev;
      else delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    }
  });
});
