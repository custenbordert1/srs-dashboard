import assert from "node:assert/strict";
import test from "node:test";
import { executivePanelErrorMessage, isIgnorableFetchError } from "@/lib/executive-panel-messages";

test("isIgnorableFetchError treats abort messages as ignorable", () => {
  assert.equal(isIgnorableFetchError(new Error("signal is aborted without reason")), true);
});

test("forecast panel uses friendly unavailable copy", () => {
  const result = executivePanelErrorMessage("forecast", new Error("signal is aborted without reason"));
  assert.equal(result.message, "Unable to generate forecast. Retry.");
});

test("forecast cached snapshot copy", () => {
  const result = executivePanelErrorMessage("forecast", new Error("timeout"), {
    showingCachedSnapshot: true,
  });
  assert.match(result.message, /cached snapshot/i);
});
