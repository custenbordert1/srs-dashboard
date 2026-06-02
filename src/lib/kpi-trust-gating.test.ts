import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatScanCompletenessLabel,
  isBreezyCandidateDependentKpi,
  resolveKpiTrustPresentation,
  shouldApplyKpiTrustGating,
} from "@/lib/kpi-trust-gating";

describe("kpi-trust-gating", () => {
  it("flags partial, degraded, and unavailable for gating", () => {
    assert.equal(shouldApplyKpiTrustGating("partial"), true);
    assert.equal(shouldApplyKpiTrustGating("degraded"), true);
    assert.equal(shouldApplyKpiTrustGating("live"), false);
  });

  it("dims Breezy candidate KPIs on partial sync", () => {
    const presentation = resolveKpiTrustPresentation("partial", "cc-7d", "command-center", {
      positionsScanned: 3,
      totalPositionsAvailable: 10,
    });
    assert.equal(presentation.dim, true);
    assert.equal(presentation.disclaimer, "Based on partial sync");
    assert.equal(presentation.scanLabel, "3 of 10 positions scanned");
  });

  it("does not dim jobs-only command center KPIs", () => {
    const presentation = resolveKpiTrustPresentation("partial", "cc-jobs", "command-center");
    assert.equal(presentation.dim, false);
  });

  it("marks alert KPIs preliminary when gated", () => {
    const presentation = resolveKpiTrustPresentation("partial", "criticalCount", "dm-alert");
    assert.equal(presentation.preliminaryAlert, true);
  });

  it("uses degraded disclaimer for stale sync", () => {
    const presentation = resolveKpiTrustPresentation("degraded", "candidates-7d", "dm-dashboard");
    assert.equal(presentation.disclaimer, "Showing last sync");
  });

  it("classifies recruiter operational Breezy metrics", () => {
    assert.equal(
      isBreezyCandidateDependentKpi("first-applicant", "recruiter-operational"),
      true,
    );
    assert.equal(
      isBreezyCandidateDependentKpi("escalation-response", "recruiter-operational"),
      false,
    );
  });

  it("formats scan completeness label", () => {
    assert.equal(
      formatScanCompletenessLabel({ positionsScanned: 4, totalPositionsAvailable: 12 }),
      "4 of 12 positions scanned",
    );
  });
});
