import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  getSendPaperworkBlockReason,
  isOnboardingTemplateConfigured,
  sendPaperworkBlockMessage,
} from "@/lib/onboarding-send-eligibility";

function sample(): BreezyCandidate {
  return {
    candidateId: "c1",
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-20",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
  };
}

describe("onboarding-send-eligibility", () => {
  it("blocks when onboarding packet template is not configured", () => {
    const row = buildBaselineWorkflowRow(sample());
    const reason = getSendPaperworkBlockReason({
      candidate: row,
      templateKey: "onboarding_packet",
      onboardingConfigured: true,
      onboardingConfigLoaded: true,
      onboardingConfigError: null,
      paperworkTemplates: [
        { key: "wage_consent", label: "Wage", configured: true },
      ],
      sendBusy: false,
    });
    assert.equal(reason, "missing_template");
  });

  it("allows send when API key, template, and email are present", () => {
    const row = buildBaselineWorkflowRow(sample());
    assert.equal(
      getSendPaperworkBlockReason({
        candidate: row,
        templateKey: "onboarding_packet",
        onboardingConfigured: true,
        onboardingConfigLoaded: true,
        onboardingConfigError: null,
        paperworkTemplates: [{ key: "onboarding_packet", label: "Packet", configured: true }],
        sendBusy: false,
      }),
      null,
    );
  });

  it("reports sending state", () => {
    const row = buildBaselineWorkflowRow(sample());
    assert.equal(
      getSendPaperworkBlockReason({
        candidate: row,
        templateKey: "onboarding_packet",
        onboardingConfigured: true,
        onboardingConfigLoaded: true,
        onboardingConfigError: null,
        paperworkTemplates: [{ key: "onboarding_packet", label: "Packet", configured: true }],
        sendBusy: true,
      }),
      "sending",
    );
  });

  it("detects configured template by key", () => {
    assert.equal(
      isOnboardingTemplateConfigured(
        [{ key: "onboarding_packet", label: "Packet", configured: true }],
        "onboarding_packet",
      ),
      true,
    );
  });

  it("includes config error detail in message", () => {
    assert.match(
      sendPaperworkBlockMessage("config_error", {
        onboardingConfigError: "HTTP 403",
      } as never),
      /HTTP 403/,
    );
  });
});
