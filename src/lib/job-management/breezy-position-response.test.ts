import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractCreatedBreezyPositionId,
  formatBreezyRejectionMessage,
} from "@/lib/job-management/breezy-position-response";

describe("extractCreatedBreezyPositionId", () => {
  it("reads top-level _id", () => {
    assert.equal(extractCreatedBreezyPositionId({ _id: "pos-abc" }), "pos-abc");
  });

  it("reads nested position object", () => {
    assert.equal(
      extractCreatedBreezyPositionId({ position: { id: "pos-nested" } }),
      "pos-nested",
    );
  });

  it("returns null when no id is present", () => {
    assert.equal(extractCreatedBreezyPositionId({ name: "Role" }), null);
    assert.equal(extractCreatedBreezyPositionId(null), null);
  });
});

describe("formatBreezyRejectionMessage", () => {
  it("returns plain-English message from Breezy JSON error", () => {
    const message = formatBreezyRejectionMessage(
      {
        error: {
          type: "addPositionNameMissing",
          message: "name is null or empty",
        },
      },
      400,
    );
    assert.match(message, /Breezy rejected this job/);
    assert.match(message, /name is null or empty/);
    assert.match(message, /addPositionNameMissing/);
  });

  it("describes auth failures clearly", () => {
    const message = formatBreezyRejectionMessage(null, 401);
    assert.match(message, /authentication failed/i);
  });
});
