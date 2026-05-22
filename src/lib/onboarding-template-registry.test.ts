import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOnboardingTemplateKey,
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
      }
    } finally {
      if (prev !== undefined) process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = prev;
      else delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    }
  });
});
