import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutiveForecastRecommendation } from "@/lib/executive-recruiting-forecast";
import { syncActionsFromForecastRecommendations } from "@/lib/executive-accountability/convert-recommendations";
import { normalizeExecutiveTrackedAction } from "@/lib/executive-accountability/action-audit";
import {
  buildStableRecommendationKey,
  buildStableRecommendationKeyFromRecommendation,
  isLegacyUnstableForecastKey,
  slugPart,
} from "@/lib/executive-accountability/stable-recommendation-key";

const now = "2026-06-15T12:00:00.000Z";

function forecastRec(
  overrides: Partial<ExecutiveForecastRecommendation> = {},
): ExecutiveForecastRecommendation {
  return {
    id: overrides.id ?? "p44-rec-1",
    kind: "escalate-dm-territory",
    title: "Escalate Amy Harp territory risk",
    rationale: "Open store calls exceed active reps",
    expectedImpact: "Reduce projected shortage",
    priority: "critical",
    territoryLabel: "TX",
    owner: "Amy Harp",
    ...overrides,
  };
}

describe("stable recommendation keys (P46.1)", () => {
  it("builds deterministic keys from business attributes", () => {
    assert.equal(
      buildStableRecommendationKeyFromRecommendation(forecastRec()),
      "p44:territory-escalation:amy-harp:tx",
    );
    assert.equal(
      buildStableRecommendationKey({
        kind: "move-recruiter-focus",
        owner: "Taylor",
      }),
      "p44:recruiter-rebalance:taylor:overloaded",
    );
    assert.equal(
      buildStableRecommendationKey({
        kind: "refresh-job-ads",
        territoryLabel: "TX",
        owner: "Amy Harp",
      }),
      "p44:job-refresh:tx:amy-harp",
    );
    assert.equal(buildStableRecommendationKey({ kind: "increase-pay" }), "p44:pay-review:global");
  });

  it("produces different keys for different territory, owner, or kind", () => {
    const tx = buildStableRecommendationKeyFromRecommendation(forecastRec({ territoryLabel: "TX" }));
    const ca = buildStableRecommendationKeyFromRecommendation(
      forecastRec({ territoryLabel: "CA", owner: "Amy Harp" }),
    );
    const otherDm = buildStableRecommendationKeyFromRecommendation(
      forecastRec({ owner: "Bill Smith", territoryLabel: "TX" }),
    );
    assert.notEqual(tx, ca);
    assert.notEqual(tx, otherDm);
  });

  it("uses deterministic fallback when optional fields are missing", () => {
    const key = buildStableRecommendationKey({
      kind: "unknown-kind",
      owner: null,
      territoryLabel: null,
      title: "Review staffing plan",
    });
    assert.equal(key, "p44:generic:unknown-kind:unknown:review-staffing-plan");
    assert.equal(slugPart(null), "unknown");
    assert.equal(slugPart("  Henkel Project  "), "henkel-project");
  });

  it("keeps the same sourceForecastKey when recommendation order and ephemeral id change", () => {
    const recA = forecastRec({ id: "p44-rec-9" });
    const recB = forecastRec({ id: "p44-rec-2" });
    assert.equal(
      buildStableRecommendationKeyFromRecommendation(recA),
      buildStableRecommendationKeyFromRecommendation(recB),
    );

    const existing = normalizeExecutiveTrackedAction({
      recommendationId: "action-1",
      sourceForecastKey: "p44-rec-9",
      recommendationKind: "escalate-dm-territory",
      territoryLabel: "TX",
      owner: "Amy Harp",
      title: recA.title,
      priority: "critical",
      status: "open",
      dueDate: now,
      createdAt: now,
      updatedAt: now,
      expectedImpact: "Reduce projected shortage",
    });

    const syncedFirst = syncActionsFromForecastRecommendations({
      existingActions: [existing],
      recommendations: [recA],
      referenceIso: now,
    });
    assert.equal(syncedFirst.length, 1);
    assert.equal(syncedFirst[0]!.sourceForecastKey, "p44:territory-escalation:amy-harp:tx");

    const syncedReordered = syncActionsFromForecastRecommendations({
      existingActions: syncedFirst,
      recommendations: [recB],
      referenceIso: now,
    });
    assert.equal(syncedReordered.length, 1);
    assert.equal(syncedReordered[0]!.recommendationId, "action-1");
    assert.equal(syncedReordered[0]!.sourceForecastKey, "p44:territory-escalation:amy-harp:tx");
  });

  it("does not duplicate actions when recommendation order changes", () => {
    const escalate = forecastRec({ id: "p44-rec-1" });
    const refresh = forecastRec({
      id: "p44-rec-2",
      kind: "refresh-job-ads",
      title: "Refresh job ads in TX",
    });

    const firstPass = syncActionsFromForecastRecommendations({
      existingActions: [],
      recommendations: [escalate, refresh],
      referenceIso: now,
    });
    assert.equal(firstPass.length, 2);

    const secondPass = syncActionsFromForecastRecommendations({
      existingActions: firstPass,
      recommendations: [refresh, escalate],
      referenceIso: now,
    });
    assert.equal(secondPass.length, 2);
    assert.equal(
      new Set(secondPass.map((row) => row.sourceForecastKey)).size,
      2,
    );
  });

  it("only archives open actions when the stable business key disappears", () => {
    const existing = syncActionsFromForecastRecommendations({
      existingActions: [],
      recommendations: [forecastRec()],
      referenceIso: now,
    });
    assert.equal(existing.length, 1);

    const afterChurn = syncActionsFromForecastRecommendations({
      existingActions: existing,
      recommendations: [],
      referenceIso: now,
    });
    assert.equal(afterChurn.length, 1);
    assert.equal(afterChurn[0]!.status, "archived");
    assert.equal(isLegacyUnstableForecastKey("p44-rec-3"), true);
    assert.equal(isLegacyUnstableForecastKey("p44:territory-escalation:amy-harp:tx"), false);
  });
});
