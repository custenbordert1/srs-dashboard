import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapToDashboardNextAction,
  resolvePreventingRule,
} from "@/lib/p151-autonomous-candidate-advancement/analyze-candidate-pipeline";
import {
  getP151MaxAdvancesPerCycle,
  getP151MaxAssignmentsPerCycle,
  isP151AutonomousAdvancementEnabled,
} from "@/lib/p151-autonomous-candidate-advancement/advance-candidate-pipeline";
import {
  P151_DEFAULT_MAX_ADVANCES,
  P151_DEFAULT_MAX_ASSIGNMENTS,
} from "@/lib/p151-autonomous-candidate-advancement/types";

describe("P151 autonomous candidate advancement", () => {
  it("is disabled by default", () => {
    assert.equal(isP151AutonomousAdvancementEnabled({}), false);
    assert.equal(isP151AutonomousAdvancementEnabled({ P151_AUTONOMOUS_ADVANCEMENT_ENABLED: "true" }), true);
  });

  it("defaults cycle limits", () => {
    assert.equal(getP151MaxAssignmentsPerCycle({}), P151_DEFAULT_MAX_ASSIGNMENTS);
    assert.equal(getP151MaxAdvancesPerCycle({}), P151_DEFAULT_MAX_ADVANCES);
    assert.equal(getP151MaxAssignmentsPerCycle({ P151_MAX_ASSIGNMENTS_PER_CYCLE: "5" }), 5);
    assert.equal(getP151MaxAdvancesPerCycle({ P151_MAX_ADVANCES_PER_CYCLE: "3" }), 3);
  });

  it("maps next actions to dashboard categories", () => {
    assert.equal(mapToDashboardNextAction("Assign Recruiter"), "Assign Recruiter");
    assert.equal(mapToDashboardNextAction("Call Candidate"), "Contact Candidate");
    assert.equal(mapToDashboardNextAction("Send Paperwork"), "Send Paperwork");
    assert.equal(mapToDashboardNextAction("Wait"), "Recruiter Review");
  });

  it("identifies unassigned recruiter as primary stopping rule", () => {
    const result = resolvePreventingRule({
      row: {
        assignedRecruiter: "Unassigned",
        workflowStatus: "Applied",
      } as never,
      evaluation: {
        nextAction: "Assign Recruiter",
        blockers: ["No Published Job"],
        automationExplanation: "blocked",
        reason: "test",
      } as never,
      p83Reason: "Awaiting recruiter assignment.",
      publishedJob: false,
      openProject: false,
    });
    assert.match(result.preventingRule, /isUnassignedRecruiter/);
    assert.match(result.recommendedFix, /recruiter assignment/i);
  });
});
