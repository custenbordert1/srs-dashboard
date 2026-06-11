import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DM_ESCALATION_ACTION_LABELS,
  type DmEscalationActionType,
} from "@/lib/dm-dashboard/dm-operational-types";
import { OPERATIONAL_ESCALATION_LABELS } from "@/lib/operational-escalation/operational-escalation-types";

const P9_ACTIONS: DmEscalationActionType[] = [
  "request-new-ad",
  "request-recruiter-assignment",
  "coverage-concern",
];

describe("dm escalation action labels", () => {
  it("maps P9 action center types to recruiter queue labels", () => {
    for (const action of P9_ACTIONS) {
      assert.ok(DM_ESCALATION_ACTION_LABELS[action]);
      assert.ok(OPERATIONAL_ESCALATION_LABELS[action]);
      assert.equal(DM_ESCALATION_ACTION_LABELS[action], OPERATIONAL_ESCALATION_LABELS[action]);
    }
  });
});
