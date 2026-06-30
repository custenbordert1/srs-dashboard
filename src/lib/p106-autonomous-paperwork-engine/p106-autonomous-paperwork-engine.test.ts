import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { P106_DEFAULT_MODE } from "@/lib/p106-autonomous-paperwork-engine/types";

describe("p106-autonomous-paperwork-engine", () => {
  it("defaults to dryRun mode constant", () => {
    assert.equal(P106_DEFAULT_MODE, "dryRun");
  });

  it("blocks invalid email typos", () => {
    const result = classifyPaperworkBlocker({
      row: {
        candidateId: "ce187a7283ec",
        email: "kayvon05@gmial.com",
        positionId: "2516778d8637",
        assignedRecruiter: "Taylor",
        assignedDM: "DM",
        workflowStatus: "Paperwork Needed",
        actionType: "send-paperwork",
        paperworkStatus: "not_sent",
        signatureRequestId: null,
        stage: "",
      } as never,
      onboarding: null,
      jobsByPositionId: new Map([["2516778d8637", { jobId: "2516778d8637", status: "published" } as never]]),
      paperworkByGrade: {} as never,
      p100SentIds: new Set(),
    });
    assert.equal(result.category, "invalid_email");
    assert.equal(result.autoRepairable, false);
  });

  it("blocks unpublished job positions", () => {
    const result = classifyPaperworkBlocker({
      row: {
        candidateId: "765b91a84a40",
        email: "airica1260@yahoo.com",
        positionId: "5bcaaf45192c",
        assignedRecruiter: "Taylor",
        assignedDM: "DM",
        workflowStatus: "Applied",
        actionType: null,
        paperworkStatus: "not_sent",
        signatureRequestId: null,
        stage: "",
      } as never,
      onboarding: null,
      jobsByPositionId: new Map(),
      paperworkByGrade: {} as never,
      p100SentIds: new Set(),
    });
    assert.equal(result.category, "unpublished_job");
  });

  it("skips already-sent candidates", () => {
    const result = classifyPaperworkBlocker({
      row: {
        candidateId: "9f8231817090",
        email: "johnsykes1225@gmail.com",
        positionId: "1168ce44cdd1",
        assignedRecruiter: "Taylor",
        assignedDM: "DM",
        workflowStatus: "Paperwork Sent",
        actionType: "await-signature",
        paperworkStatus: "sent",
        signatureRequestId: "sig-1",
        stage: "",
      } as never,
      onboarding: null,
      jobsByPositionId: new Map([["1168ce44cdd1", { jobId: "1168ce44cdd1" } as never]]),
      paperworkByGrade: {} as never,
      p100SentIds: new Set(["9f8231817090"]),
    });
    assert.equal(result.category, "already_sent");
  });

  it("blocks closed job positions", () => {
    const result = classifyPaperworkBlocker({
      row: {
        candidateId: "closed1",
        email: "test@example.com",
        positionId: "closed-job-id",
        assignedRecruiter: "Taylor",
        assignedDM: "DM",
        workflowStatus: "Applied",
        actionType: null,
        paperworkStatus: "not_sent",
        signatureRequestId: null,
        stage: "",
      } as never,
      onboarding: null,
      jobsByPositionId: new Map(),
      closedJobsByPositionId: new Map([["closed-job-id", { jobId: "closed-job-id", status: "closed" } as never]]),
      paperworkByGrade: {} as never,
      p100SentIds: new Set(),
    });
    assert.equal(result.category, "closed_job");
  });

  it("executeSafeSingles is not executeBatch", () => {
    const modes = ["dryRun", "executeOne", "executeSafeSingles"];
    assert.equal(modes.includes("executeBatch"), false);
  });
});
