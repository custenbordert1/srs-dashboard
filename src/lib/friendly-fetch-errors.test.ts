import assert from "node:assert/strict";
import test from "node:test";
import {
  friendlyFetchMessageFromError,
  isIgnorableFetchError,
  sanitizeFriendlyFetchMessage,
} from "@/lib/friendly-fetch-errors";

test("isIgnorableFetchError treats abort messages as ignorable", () => {
  assert.equal(isIgnorableFetchError(new Error("signal is aborted without reason")), true);
  assert.equal(isIgnorableFetchError(new Error("Request cancelled")), true);
  assert.equal(isIgnorableFetchError(new Error("The user aborted a request")), true);
});

test("sanitizeFriendlyFetchMessage replaces technical errors", () => {
  const message = sanitizeFriendlyFetchMessage("Request cancelled", "overview");
  assert.ok(message);
  assert.doesNotMatch(message, /cancelled/i);
});

test("friendlyFetchMessageFromError returns null for abort", () => {
  assert.equal(friendlyFetchMessageFromError(new Error("signal is aborted without reason"), "forecast"), null);
});
