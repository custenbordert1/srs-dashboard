import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { canLiveSendPaperwork } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildBreezyEnvironmentValidation } from "@/lib/breezy-environment-validation/build-breezy-environment-validation";

describe("breezy-environment-validation (P92.1)", () => {
  it("never enables live paperwork sends", () => {
    assert.equal(DEFAULT_P84_FEATURE_FLAGS.liveSend, false);
    assert.equal(canLiveSendPaperwork(DEFAULT_P84_FEATURE_FLAGS), false);
  });

  it("reports missing BREEZY_API_KEY without attempting auth", async () => {
    const prior = process.env.BREEZY_API_KEY;
    delete process.env.BREEZY_API_KEY;
    const { invalidateConfigCache } = await import("@/lib/config");
    invalidateConfigCache();

    const report = await buildBreezyEnvironmentValidation({ rerunP92OnSuccess: false });
    assert.equal(report.overallOk, false);
    assert.equal(report.authentication.status, "not_attempted");
    assert.ok(report.missingRequired.includes("BREEZY_API_KEY"));
    assert.equal(report.p92RerunTriggered, false);

    if (prior) process.env.BREEZY_API_KEY = prior;
    invalidateConfigCache();
  });
});
