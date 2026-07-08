import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  P161_CLIENT_SECTION_TIMEOUT_MS,
  P161_MAJOR_PAGES,
  P161_SERVER_DASHBOARD_TIMEOUT_MS,
} from "@/lib/app-loading-reliability/constants";
import { buildDegradedWarning, buildDisabledByDesignLabel } from "@/lib/app-loading-reliability/degraded-mode";
import { deriveSectionHealth, collectDegradedSectionIds } from "@/lib/app-loading-reliability/section-health";
import { withRequestTimeout } from "@/lib/app-loading-reliability/request-timeout";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { emptyP156Queue } from "@/lib/app-loading-reliability/api-fallbacks";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";

describe("P161 global loading reliability", () => {
  it("defines 5s client section timeout", () => {
    assert.equal(P161_CLIENT_SECTION_TIMEOUT_MS, 5_000);
    assert.ok(P161_SERVER_DASHBOARD_TIMEOUT_MS > P161_CLIENT_SECTION_TIMEOUT_MS);
  });

  it("audits all major pages", () => {
    assert.equal(P161_MAJOR_PAGES.length, 15);
    assert.ok(P161_MAJOR_PAGES.includes("executive-home"));
    assert.ok(P161_MAJOR_PAGES.includes("operations-control-center"));
  });

  it("builds degraded warnings for timeout and disabled modes", () => {
    const timeout = buildDegradedWarning({
      label: "Queue",
      kind: "error",
      timedOut: true,
    });
    assert.equal(timeout.kind, "timeout");
    assert.match(timeout.message, /Queue/);

    const disabled = buildDegradedWarning({ label: "Daemon", kind: "disabled" });
    assert.equal(disabled.retryable, false);

    assert.match(buildDisabledByDesignLabel("Continuous mode"), /disabled by design/i);
  });

  it("derives section health states", () => {
    const healthy = deriveSectionHealth({
      id: "a",
      label: "A",
      lastSuccessAt: new Date().toISOString(),
    });
    assert.equal(healthy.status, "healthy");

    const stale = deriveSectionHealth({
      id: "b",
      label: "B",
      stale: true,
      error: "timeout",
      lastSuccessAt: new Date().toISOString(),
    });
    assert.equal(stale.status, "stale");

    const degraded = collectDegradedSectionIds([healthy, stale]);
    assert.deepEqual(degraded, ["b"]);
  });

  it("times out slow promises and returns fallback", async () => {
    const result = await withRequestTimeout({
      label: "slow",
      promise: new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 200)),
      timeoutMs: 20,
      fallback: "fallback",
    });
    assert.equal(result.value, "fallback");
    assert.equal(result.timedOut, true);
  });

  it("wraps API responses with degraded metadata", async () => {
    const safe = await buildSafeApiResponse({
      label: "test",
      timeoutMs: 20,
      build: async () => ({ value: 1 }),
      fallback: () => ({ value: 0 }),
    });
    assert.equal(safe.ok, true);
    assert.equal(safe.payload.value, 1);

    const slow = await buildSafeApiResponse({
      label: "slow-test",
      timeoutMs: 15,
      build: () => new Promise<{ value: number }>((resolve) => setTimeout(() => resolve({ value: 9 }), 100)),
      fallback: () => ({ value: 0 }),
    });
    assert.equal(slow.ok, false);
    assert.equal(slow.meta.degraded, true);
    assert.equal(slow.payload.value, 0);
  });

  it("provides empty queue fallback", () => {
    const queue = emptyP156Queue({
      recruiter: null,
      dm: null,
      state: null,
      project: null,
      priorityMin: null,
      priorityMax: null,
      stage: null,
    });
    assert.equal(queue.candidates.length, 0);
    assert.ok(queue.warnings.length > 0);
  });

  it("does not enable continuous mode by default", () => {
    assert.equal(isP154ContinuousEnabled(), false);
  });
});
