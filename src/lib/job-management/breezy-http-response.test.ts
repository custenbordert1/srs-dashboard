import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BREEZY_NON_JSON_USER_MESSAGE,
  bodyPreview,
  parseHttpBody,
  parseJobManagementPushResponse,
} from "@/lib/job-management/breezy-http-response";

describe("breezy http response", () => {
  it("detects HTML bodies as non-JSON", () => {
    const parsed = parseHttpBody('<!DOCTYPE html><html><body>Error</body></html>');
    assert.equal(parsed.isJson, false);
  });

  it("truncates body preview to 300 characters", () => {
    const preview = bodyPreview("x".repeat(400));
    assert.equal(preview.length, 301);
    assert.match(preview, /…$/);
  });

  it("parseJobManagementPushResponse returns actionable error for HTML", async () => {
    const res = new Response("<!DOCTYPE html><html></html>", {
      status: 502,
      statusText: "Bad Gateway",
      headers: { "content-type": "text/html" },
    });
    const parsed = await parseJobManagementPushResponse(res);
    assert.notEqual(parsed.ok, true);
    assert.match(parsed.error ?? "", new RegExp(BREEZY_NON_JSON_USER_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("parseJobManagementPushResponse parses JSON push success", async () => {
    const res = new Response(JSON.stringify({ ok: true, breezyJobId: "job-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const parsed = await parseJobManagementPushResponse(res);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.breezyJobId, "job-1");
  });
});
