import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";

const sessionStore = new Map<string, string>();

function installBrowserSessionStorage(): void {
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
      clear: () => {
        sessionStore.clear();
      },
    },
    configurable: true,
  });
}

function makeSnapshot(
  count: number,
  scanMode: "preview" | "fast" | "full" = "fast",
): BreezyCandidatesSuccess {
  return {
    ok: true,
    companyId: "co-1",
    candidates: Array.from({ length: count }, (_, index) => ({
      candidateId: `c-${index}`,
    })) as BreezyCandidatesSuccess["candidates"],
    fetchedAt: new Date().toISOString(),
    scanMode,
    positionsScanned: count,
  };
}

describe("breezy candidates zero regression", () => {
  beforeEach(() => {
    sessionStore.clear();
    installBrowserSessionStorage();
  });

  afterEach(() => {
    sessionStore.clear();
  });

  it("getRecoverable reads persisted high-water when in-memory watermark is unset", async () => {
    const rich = makeSnapshot(48, "full");
    sessionStorage.setItem(
      "breezy:candidates:tab:highWater:v1",
      JSON.stringify({
        savedAt: Date.now(),
        candidateCount: 48,
        continuationPoint: 30,
        snapshot: rich,
      }),
    );

    const client = await import("@/lib/breezy-candidates-client");
    const recovered = client.getRecoverableTabCandidatesSnapshot();
    assert.equal(recovered?.candidates.length, 48);
  });

  it("restores high-water snapshot from sessionStorage on startup", async () => {
    const rich = makeSnapshot(72, "full");
    sessionStorage.setItem(
      "breezy:candidates:tab:highWater:v1",
      JSON.stringify({
        savedAt: Date.now(),
        candidateCount: 72,
        continuationPoint: 40,
        snapshot: rich,
      }),
    );

    const client = await import("@/lib/breezy-candidates-client");
    const restored = client.getStartupRestoredTabSnapshot();
    assert.equal(restored?.candidates.length, 72);
  });

});
