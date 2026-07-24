import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";
import {
  P220_APPROVED_BY,
  P220_MAX_CANDIDATES,
  P220_TARGET_STAGE,
  P220_TARGETS,
  type P220EligibilityEvidence,
  type P220WorkflowSnapshot,
} from "@/lib/p220-controlled-paperwork-transition/types";
import {
  assertP220LiveAuthorized,
  authorizeP220Mode,
  parseP220Mode,
} from "@/lib/p220-controlled-paperwork-transition/authorize";
import {
  assertP220NoSendPath,
  assertP220WriteBudget,
  detectP220SendPathRisk,
  diffP220GlobalStore,
  findP220Target,
  isP220ApprovedCandidateId,
  verifyP220AssignedDm,
  verifyP220Eligibility,
  verifyP220PostWrite,
  verifyP220PreWrite,
} from "@/lib/p220-controlled-paperwork-transition/verify";

const columbusEvidence: P220EligibilityEvidence = {
  nearestActiveWorkMiles: 0,
  hasActiveOpportunities: true,
  coverageKnown: true,
  jobCity: "Columbus",
  jobState: "OH",
};

const kcEvidence: P220EligibilityEvidence = {
  nearestActiveWorkMiles: 8.3,
  hasActiveOpportunities: true,
  coverageKnown: true,
  jobCity: "Kansas City",
  jobState: "MO",
};

function snap(overrides: Partial<P220WorkflowSnapshot> = {}): P220WorkflowSnapshot {
  return {
    candidateId: P220_TARGETS[0]!.candidateId,
    workflowStatus: "Operator Approved",
    assignedDM: "Mindie Rodriguez",
    assignedRecruiter: "Unassigned",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    notes: ["keep"],
    history: [{ id: "h1", type: "assignment", message: "Assigned DM changed to Mindie Rodriguez.", createdAt: "t0" }],
    nextActionNeeded: "Await Paperwork Needed authorization",
    lastActionAt: "t0",
    updatedAt: "t0",
    ...overrides,
  };
}

describe("P220 target set", () => {
  it("freezes exactly two P219 candidates", () => {
    assert.equal(P220_TARGETS.length, P220_MAX_CANDIDATES);
    assert.equal(P220_MAX_CANDIDATES, 2);
  });

  it("targets Columbus→Mindie and Kansas City→Amy", () => {
    assert.equal(P220_TARGETS[0]!.expectedCity, "Columbus");
    assert.equal(P220_TARGETS[0]!.expectedDm, "Mindie Rodriguez");
    assert.equal(P220_TARGETS[1]!.expectedCity, "Kansas City");
    assert.equal(P220_TARGETS[1]!.expectedDm, "Amy Harp");
  });

  it("rejects unknown candidate ids", () => {
    assert.equal(isP220ApprovedCandidateId("0f25dd13d4ed"), true);
    assert.equal(isP220ApprovedCandidateId("not-a-target"), false);
    assert.equal(findP220Target("bc2111302660")?.expectedDm, "Amy Harp");
  });
});

describe("P220 authorization", () => {
  it("defaults to preview without --live", () => {
    assert.equal(parseP220Mode([]), "preview");
    const auth = authorizeP220Mode([]);
    assert.equal(auth.mode, "preview");
    assert.equal(auth.approved, true);
  });

  it("requires live operator approval with exact approved-by", () => {
    const auth = authorizeP220Mode([
      "--live",
      "--operator-approved",
      `--approved-by=${P220_APPROVED_BY}`,
    ]);
    assert.equal(auth.approved, true);
    assert.equal(auth.mode, "live");
    assert.equal(auth.approvedBy, P220_APPROVED_BY);
  });

  it("rejects live without operator approval", () => {
    const auth = authorizeP220Mode(["--live", `--approved-by=${P220_APPROVED_BY}`]);
    assert.equal(auth.approved, false);
    assert.ok(auth.failures.some((f) => f.includes("--operator-approved")));
  });

  it("rejects wrong approved-by name", () => {
    const auth = authorizeP220Mode([
      "--live",
      "--operator-approved",
      "--approved-by=Someone Else",
    ]);
    assert.equal(auth.approved, false);
    assert.ok(auth.failures.some((f) => f.includes(P220_APPROVED_BY)));
  });

  it("assertP220LiveAuthorized throws for preview", () => {
    assert.throws(
      () => assertP220LiveAuthorized(authorizeP220Mode([])),
      /requires --live/,
    );
  });
});

describe("P220 abort rules", () => {
  it("aborts when assignedDM does not match P219 expectation", () => {
    const result = verifyP220AssignedDm(
      P220_TARGETS[0]!,
      snap({ assignedDM: "Amy Harp" }),
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /assignedDM/);
  });

  it("aborts when candidate is not eligible", () => {
    const result = verifyP220Eligibility(
      P220_TARGETS[0]!,
      snap({ assignedDM: "Unassigned" }),
      columbusEvidence,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /not eligible/);
  });

  it("aborts when stage is beyond Paperwork Needed", () => {
    const result = verifyP220PreWrite(
      P220_TARGETS[0]!,
      snap({ workflowStatus: "Paperwork Sent" }),
      columbusEvidence,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /beyond Paperwork Needed/);
  });

  it("aborts when send path is already active", () => {
    const risks = detectP220SendPathRisk(
      snap({ paperworkStatus: "sent", signatureRequestId: "sig_123" }),
    );
    assert.ok(risks.some((r) => /paperworkStatus/.test(r)));
    assert.ok(risks.some((r) => /signatureRequestId/.test(r)));
  });

  it("assertP220NoSendPath throws on send vocabulary", () => {
    assert.throws(() => assertP220NoSendPath("sendTemplateSignatureRequest"), /send path/);
    assert.doesNotThrow(() => assertP220NoSendPath("p220_paperwork_needed_transition"));
  });

  it("enforces write budget of two", () => {
    assert.doesNotThrow(() => assertP220WriteBudget(2));
    assert.throws(() => assertP220WriteBudget(3), /write budget exceeded/);
  });
});

describe("P220 pre-write gates", () => {
  it("passes for eligible Operator Approved → Paperwork Needed candidate", () => {
    const result = verifyP220PreWrite(P220_TARGETS[0]!, snap(), columbusEvidence);
    assert.equal(result.ok, true, result.failures.join("; "));
  });

  it("passes for eligible candidate already at Paperwork Needed", () => {
    const result = verifyP220PreWrite(
      P220_TARGETS[0]!,
      snap({
        workflowStatus: "Paperwork Needed",
        nextActionNeeded: "Send onboarding paperwork",
      }),
      columbusEvidence,
    );
    assert.equal(result.ok, true, result.failures.join("; "));
  });

  it("passes Kansas City / Amy Harp with P214 gates clear", () => {
    const record = snap({
      candidateId: P220_TARGETS[1]!.candidateId,
      assignedDM: "Amy Harp",
    });
    const result = verifyP220PreWrite(P220_TARGETS[1]!, record, kcEvidence);
    assert.equal(result.ok, true, result.failures.join("; "));
    const gates = evaluateP214Gates({
      ...kcEvidence,
      assignedDm: "Amy Harp",
      expectedDm: "Amy Harp",
    });
    assert.equal(gates.eligible, true);
  });
});

describe("P220 write surface / post-write verification", () => {
  it("accepts a real stage transition with one status history event", () => {
    const before = snap();
    const after = snap({
      workflowStatus: P220_TARGET_STAGE,
      lastActionAt: "t1",
      updatedAt: "t1",
      nextActionNeeded: "Send onboarding paperwork",
      history: [
        {
          id: "h0",
          type: "status",
          message: "Status changed to Paperwork Needed.",
          createdAt: "t1",
        },
        ...(before.history ?? []),
      ],
    });
    const result = verifyP220PostWrite({ target: P220_TARGETS[0]!, before, after });
    assert.equal(result.ok, true, result.failures.join("; "));
    assert.equal(result.previousStage, "Operator Approved");
    assert.equal(result.newStage, "Paperwork Needed");
  });

  it("accepts idempotent affirm when already at Paperwork Needed (timestamps only)", () => {
    const before = snap({
      workflowStatus: "Paperwork Needed",
      nextActionNeeded: "Send onboarding paperwork",
    });
    const after = snap({
      workflowStatus: "Paperwork Needed",
      nextActionNeeded: "Send onboarding paperwork",
      lastActionAt: "t1",
      updatedAt: "t1",
    });
    const result = verifyP220PostWrite({ target: P220_TARGETS[0]!, before, after });
    assert.equal(result.ok, true, result.failures.join("; "));
    assert.equal(result.previousStage, "Paperwork Needed");
    assert.equal(result.newStage, "Paperwork Needed");
  });

  it("rejects assignedDM, recruiter, notes, or paperwork mutations", () => {
    const before = snap({ workflowStatus: "Paperwork Needed" });
    const after = snap({
      workflowStatus: "Paperwork Needed",
      assignedDM: "Someone Else",
      assignedRecruiter: "Recruiter A",
      notes: ["keep", "new"],
      paperworkStatus: "sent",
      lastActionAt: "t1",
      updatedAt: "t1",
    });
    const result = verifyP220PostWrite({ target: P220_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    const joined = result.failures.join(" ");
    assert.match(joined, /assignedDM/);
    assert.match(joined, /assignedRecruiter/);
    assert.match(joined, /notes/);
    assert.match(joined, /paperworkStatus/);
  });

  it("rejects advancing beyond Paperwork Needed", () => {
    const before = snap({ workflowStatus: "Paperwork Needed" });
    const after = snap({
      workflowStatus: "Paperwork Sent",
      lastActionAt: "t1",
      updatedAt: "t1",
      history: [
        { id: "h0", type: "status", message: "Status changed to Paperwork Sent.", createdAt: "t1" },
        ...(before.history ?? []),
      ],
    });
    const result = verifyP220PostWrite({ target: P220_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /expected "Paperwork Needed"/);
  });

  it("rejects history noise on idempotent affirm", () => {
    const before = snap({ workflowStatus: "Paperwork Needed" });
    const after = snap({
      workflowStatus: "Paperwork Needed",
      lastActionAt: "t1",
      updatedAt: "t1",
      history: [
        { id: "h0", type: "status", message: "Status changed to Paperwork Needed.", createdAt: "t1" },
        ...(before.history ?? []),
      ],
    });
    const result = verifyP220PostWrite({ target: P220_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /history changed without a stage transition/);
  });
});

describe("P220 global audit", () => {
  it("reports exactly two target changes and zero non-target", () => {
    const before = {
      [P220_TARGETS[0]!.candidateId]: snap(),
      [P220_TARGETS[1]!.candidateId]: snap({
        candidateId: P220_TARGETS[1]!.candidateId,
        assignedDM: "Amy Harp",
      }),
      other: snap({ candidateId: "other", assignedDM: "Amy Harp" }),
    };
    const after = {
      ...before,
      [P220_TARGETS[0]!.candidateId]: snap({
        workflowStatus: "Paperwork Needed",
        updatedAt: "t1",
        lastActionAt: "t1",
      }),
      [P220_TARGETS[1]!.candidateId]: snap({
        candidateId: P220_TARGETS[1]!.candidateId,
        assignedDM: "Amy Harp",
        workflowStatus: "Paperwork Needed",
        updatedAt: "t1",
        lastActionAt: "t1",
      }),
    };
    const diff = diffP220GlobalStore({
      before,
      after,
      targetIds: P220_TARGETS.map((t) => t.candidateId),
    });
    assert.equal(diff.targetIdsChanged.length, 2);
    assert.deepEqual(diff.nonTargetIdsChanged, []);
    assert.deepEqual(diff.recordsAdded, []);
    assert.deepEqual(diff.recordsRemoved, []);
  });

  it("detects non-target writes", () => {
    const before = {
      [P220_TARGETS[0]!.candidateId]: snap(),
      other: snap({ candidateId: "other" }),
    };
    const after = {
      [P220_TARGETS[0]!.candidateId]: snap({
        workflowStatus: "Paperwork Needed",
        updatedAt: "t1",
      }),
      other: snap({ candidateId: "other", workflowStatus: "Paperwork Needed", updatedAt: "t1" }),
    };
    const diff = diffP220GlobalStore({
      before,
      after,
      targetIds: P220_TARGETS.map((t) => t.candidateId),
    });
    assert.deepEqual(diff.nonTargetIdsChanged, ["other"]);
  });
});
