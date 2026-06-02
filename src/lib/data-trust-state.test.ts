import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDataTrustState,
  dataTrustStatusMessage,
  isIncompletePositionScan,
} from "@/lib/data-trust-state";

describe("data-trust-state", () => {
  it("returns loading when fetching without data", () => {
    assert.equal(buildDataTrustState({ loading: true, hasData: false }), "loading");
    assert.equal(buildDataTrustState({ refreshing: true, hasData: true }), "loading");
  });

  it("returns degraded when error with prior data", () => {
    assert.equal(
      buildDataTrustState({ hasData: true, error: "Timed out", timedOut: true }),
      "degraded",
    );
  });

  it("returns partial for partialSync and fast scan gaps", () => {
    assert.equal(buildDataTrustState({ hasData: true, partialSync: true }), "partial");
    assert.ok(
      isIncompletePositionScan({
        scanMode: "fast",
        positionsScanned: 40,
        totalPositionsAvailable: 100,
      }),
    );
    assert.equal(
      buildDataTrustState({
        hasData: true,
        scanMode: "fast",
        positionsScanned: 40,
        totalPositionsAvailable: 100,
      }),
      "partial",
    );
  });

  it("returns cached when fromCache without errors", () => {
    assert.equal(buildDataTrustState({ hasData: true, fromCache: true }), "cached");
  });

  it("returns live for complete fresh data", () => {
    assert.equal(
      buildDataTrustState({
        hasData: true,
        scanMode: "full",
        positionsScanned: 50,
        totalPositionsAvailable: 50,
      }),
      "live",
    );
  });

  it("formats partial status message with scan counts", () => {
    const message = dataTrustStatusMessage("partial", {
      positionsScanned: 12,
      totalPositionsAvailable: 80,
    });
    assert.match(message, /12 of 80/);
  });
});
