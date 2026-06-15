import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANDIDATES_CENTER_HYDRATION_NOTE } from "@/lib/recruiting-intelligence/load-recruiting-candidates-center-bundle";

describe("load-recruiting-candidates-center-bundle", () => {
  it("documents why full hydration stays on direct Breezy route", () => {
    assert.match(CANDIDATES_CENTER_HYDRATION_NOTE, /recruiting intelligence snapshot/);
    assert.match(CANDIDATES_CENTER_HYDRATION_NOTE, /\/api\/breezy\/candidates/);
  });
});
