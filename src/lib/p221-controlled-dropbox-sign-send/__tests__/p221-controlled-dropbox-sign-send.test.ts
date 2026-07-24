import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import {
  P221_APPROVED_BY,
  P221_MAX_CANDIDATES,
  P221_POST_SEND_STAGE,
  P221_TARGETS,
  type P221EligibilityEvidence,
  type P221WorkflowSnapshot,
} from "@/lib/p221-controlled-dropbox-sign-send/types";
import {
  assertP221LiveAuthorized,
  authorizeP221Mode,
  parseP221Mode,
} from "@/lib/p221-controlled-dropbox-sign-send/authorize";
import {
  assertP221ExactlyTwoSignatureRequests,
  assertP221NoExternalWrite,
  assertP221WriteBudget,
  diffP221GlobalStore,
  isP221ApprovedCandidateId,
  verifyP221PostWrite,
  verifyP221Preflight,
} from "@/lib/p221-controlled-dropbox-sign-send/verify";

const columbusEvidence: P221EligibilityEvidence = {
  nearestActiveWorkMiles: 0,
  hasActiveOpportunities: true,
  coverageKnown: true,
  jobCity: "Columbus",
  jobState: "OH",
};

function snap(overrides: Partial<P221WorkflowSnapshot> = {}): P221WorkflowSnapshot {
  return {
    candidateId: P221_TARGETS[0]!.candidateId,
    workflowStatus: "Paperwork Needed",
    assignedDM: "Mindie Rodriguez",
    assignedRecruiter: "Unassigned",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkSentAt: null,
    paperworkTemplateKey: null,
    onboardingContactEmail: null,
    notes: ["keep"],
    history: [
      {
        id: "h1",
        type: "assignment",
        message: "Assigned DM changed to Mindie Rodriguez.",
        createdAt: "t0",
      },
    ],
    nextActionNeeded: "Send onboarding paperwork",
    lastActionAt: "t0",
    updatedAt: "t0",
    ...overrides,
  };
}

function sentSnap(overrides: Partial<P221WorkflowSnapshot> = {}): P221WorkflowSnapshot {
  const before = snap();
  return snap({
    workflowStatus: P221_POST_SEND_STAGE,
    paperworkStatus: "sent",
    signatureRequestId: "sig_abc123",
    paperworkSentAt: "t1",
    paperworkTemplateKey: "onboarding_packet",
    onboardingContactEmail: P221_TARGETS[0]!.expectedEmail,
    lastActionAt: "t1",
    updatedAt: "t1",
    nextActionNeeded: "Send onboarding paperwork",
    history: [
      {
        id: "h0",
        type: "paperwork",
        message: "Onboarding paperwork sent (onboarding_packet). Request sig_abc123.",
        createdAt: "t1",
      },
      {
        id: "h0b",
        type: "status",
        message: "Status changed to Paperwork Sent.",
        createdAt: "t1",
      },
      ...(before.history ?? []),
    ],
    ...overrides,
  });
}

describe("P221 target set", () => {
  it("freezes exactly two P219/P220 candidates", () => {
    assert.equal(P221_TARGETS.length, P221_MAX_CANDIDATES);
    assert.equal(isP221ApprovedCandidateId("0f25dd13d4ed"), true);
    assert.equal(isP221ApprovedCandidateId("nope"), false);
  });

  it("targets Columbus→Mindie and Kansas City→Amy with contact emails", () => {
    assert.equal(P221_TARGETS[0]!.expectedDm, "Mindie Rodriguez");
    assert.equal(P221_TARGETS[1]!.expectedDm, "Amy Harp");
    assert.ok(P221_TARGETS[0]!.expectedEmail.includes("@"));
    assert.ok(P221_TARGETS[1]!.expectedEmail.includes("@"));
  });
});

describe("P221 authorization", () => {
  it("defaults to preview without --live", () => {
    assert.equal(parseP221Mode([]), "preview");
    assert.equal(authorizeP221Mode([]).approved, true);
  });

  it("requires live operator approval with exact approved-by", () => {
    const auth = authorizeP221Mode([
      "--live",
      "--operator-approved",
      `--approved-by=${P221_APPROVED_BY}`,
    ]);
    assert.equal(auth.approved, true);
    assert.equal(auth.mode, "live");
  });

  it("rejects live without operator approval", () => {
    const auth = authorizeP221Mode(["--live", `--approved-by=${P221_APPROVED_BY}`]);
    assert.equal(auth.approved, false);
  });

  it("rejects wrong approved-by", () => {
    const auth = authorizeP221Mode([
      "--live",
      "--operator-approved",
      "--approved-by=Someone Else",
    ]);
    assert.equal(auth.approved, false);
  });

  it("assertP221LiveAuthorized throws for preview", () => {
    assert.throws(() => assertP221LiveAuthorized(authorizeP221Mode([])), /requires --live/);
  });
});

describe("P221 preflight / eligibility / duplicate prevention", () => {
  it("passes for Paperwork Needed + not_sent + matching DM", () => {
    const result = verifyP221Preflight(P221_TARGETS[0]!, snap(), columbusEvidence);
    assert.equal(result.ok, true, result.failures.join("; "));
  });

  it("aborts when stage is not Paperwork Needed", () => {
    const result = verifyP221Preflight(
      P221_TARGETS[0]!,
      snap({ workflowStatus: "Applied" }),
      columbusEvidence,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /Paperwork Needed/);
  });

  it("aborts when paperworkStatus is not not_sent", () => {
    const result = verifyP221Preflight(
      P221_TARGETS[0]!,
      snap({ paperworkStatus: "sent", signatureRequestId: "sig_x" }),
      columbusEvidence,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /not_sent|signatureRequestId|duplicate/i);
  });

  it("aborts when signatureRequestId already exists", () => {
    const result = verifyP221Preflight(
      P221_TARGETS[0]!,
      snap({ signatureRequestId: "sig_existing" }),
      columbusEvidence,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /signatureRequestId/);
  });

  it("aborts when assignedDM mismatches", () => {
    const result = verifyP221Preflight(
      P221_TARGETS[0]!,
      snap({ assignedDM: "Amy Harp" }),
      columbusEvidence,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /assignedDM/);
  });

  it("aborts when eligibility gates fail", () => {
    const result = verifyP221Preflight(
      P221_TARGETS[0]!,
      snap({ assignedDM: "Unassigned" }),
      columbusEvidence,
    );
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /not eligible/);
  });

  it("duplicatePaperworkSendBlockReason blocks already-sent packets", () => {
    const reason = duplicatePaperworkSendBlockReason({
      workflow: snap({
        paperworkStatus: "sent",
        signatureRequestId: "sig_1",
        workflowStatus: "Paperwork Sent",
      }) as any,
      activeOnboarding: null,
    });
    assert.ok(reason);
  });
});

describe("P221 durable write surface / verification", () => {
  it("accepts a successful send write surface", () => {
    const before = snap();
    const after = sentSnap();
    const result = verifyP221PostWrite({ target: P221_TARGETS[0]!, before, after });
    assert.equal(result.ok, true, result.failures.join("; "));
    assert.equal(result.previousStage, "Paperwork Needed");
    assert.equal(result.newStage, "Paperwork Sent");
    assert.equal(result.previousPaperworkStatus, "not_sent");
    assert.equal(result.newPaperworkStatus, "sent");
  });

  it("rejects missing signatureRequestId", () => {
    const result = verifyP221PostWrite({
      target: P221_TARGETS[0]!,
      before: snap(),
      after: sentSnap({ signatureRequestId: null }),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /signatureRequestId missing/);
  });

  it("rejects assignedDM / recruiter / notes mutations", () => {
    const result = verifyP221PostWrite({
      target: P221_TARGETS[0]!,
      before: snap(),
      after: sentSnap({
        assignedDM: "Someone Else",
        assignedRecruiter: "Recruiter A",
        notes: ["keep", "new"],
      }),
    });
    assert.equal(result.ok, false);
    const joined = result.failures.join(" ");
    assert.match(joined, /assignedDM/);
    assert.match(joined, /assignedRecruiter/);
    assert.match(joined, /notes/);
  });

  it("rejects advancing beyond Paperwork Sent", () => {
    const result = verifyP221PostWrite({
      target: P221_TARGETS[0]!,
      before: snap(),
      after: sentSnap({ workflowStatus: "Signed" }),
    });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /Paperwork Sent|beyond/);
  });

  it("rejects history without a paperwork event", () => {
    const before = snap();
    const after = sentSnap({
      history: [
        { id: "h0", type: "status", message: "Status changed to Paperwork Sent.", createdAt: "t1" },
        ...(before.history ?? []),
      ],
    });
    const result = verifyP221PostWrite({ target: P221_TARGETS[0]!, before, after });
    assert.equal(result.ok, false);
    assert.match(result.failures.join(" "), /paperwork/);
  });

  it("accepts paperwork-only history when stage was already Paperwork Sent", () => {
    const before = snap({ workflowStatus: "Paperwork Sent" });
    const after = sentSnap({
      history: [
        {
          id: "h0",
          type: "paperwork",
          message: "Onboarding paperwork sent (onboarding_packet). Request sig_abc123.",
          createdAt: "t1",
        },
        ...(before.history ?? []),
      ],
    });
    // Stage already Paperwork Sent — only paperwork event required.
    const result = verifyP221PostWrite({ target: P221_TARGETS[0]!, before, after });
    assert.equal(result.ok, true, result.failures.join("; "));
  });
});

describe("P221 global audit + budgets", () => {
  it("reports exactly two target changes", () => {
    const before = {
      [P221_TARGETS[0]!.candidateId]: snap(),
      [P221_TARGETS[1]!.candidateId]: snap({
        candidateId: P221_TARGETS[1]!.candidateId,
        assignedDM: "Amy Harp",
      }),
      other: snap({ candidateId: "other", assignedDM: "Amy Harp" }),
    };
    const after = {
      ...before,
      [P221_TARGETS[0]!.candidateId]: sentSnap(),
      [P221_TARGETS[1]!.candidateId]: sentSnap({
        candidateId: P221_TARGETS[1]!.candidateId,
        assignedDM: "Amy Harp",
        signatureRequestId: "sig_kc",
        onboardingContactEmail: P221_TARGETS[1]!.expectedEmail,
      }),
    };
    const diff = diffP221GlobalStore({
      before,
      after,
      targetIds: P221_TARGETS.map((t) => t.candidateId),
    });
    assert.equal(diff.targetIdsChanged.length, 2);
    assert.deepEqual(diff.nonTargetIdsChanged, []);
  });

  it("detects non-target writes", () => {
    const before = {
      [P221_TARGETS[0]!.candidateId]: snap(),
      other: snap({ candidateId: "other" }),
    };
    const after = {
      [P221_TARGETS[0]!.candidateId]: sentSnap(),
      other: snap({ candidateId: "other", paperworkStatus: "sent", updatedAt: "t1" }),
    };
    const diff = diffP221GlobalStore({
      before,
      after,
      targetIds: P221_TARGETS.map((t) => t.candidateId),
    });
    assert.deepEqual(diff.nonTargetIdsChanged, ["other"]);
  });

  it("enforces exactly-two write budget and signature count", () => {
    assert.doesNotThrow(() => assertP221WriteBudget(2));
    assert.throws(() => assertP221WriteBudget(3), /write budget/);
    assert.throws(() => assertP221WriteBudget(1), /exactly 2/);
    assert.doesNotThrow(() => assertP221ExactlyTwoSignatureRequests(["a", "b"]));
    assert.throws(() => assertP221ExactlyTwoSignatureRequests(["a", "a"]), /exactly 2/);
  });

  it("rejects MEL/Breezy/recruiter write vocabulary", () => {
    assert.throws(() => assertP221NoExternalWrite("mel_write"), /disallowed/);
    assert.throws(() => assertP221NoExternalWrite("breezy write"), /disallowed/);
    assert.doesNotThrow(() => assertP221NoExternalWrite("dropbox_sign_send"));
  });
});
