import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRecruiterEscalation,
  listDmEscalationsForUser,
  listRecruiterEscalations,
} from "@/lib/operational-escalation/operational-escalation-store";
import type { AuthSession } from "@/lib/auth/types";

const dmSession: AuthSession = {
  userId: "dm-test-1",
  name: "Test DM",
  role: "dm",
  territoryStates: ["TX"],
};

const otherDmSession: AuthSession = {
  userId: "dm-test-2",
  name: "Other DM",
  role: "dm",
  territoryStates: ["CA"],
};

describe("operational escalation store", () => {
  it("lists escalations filtered by DM user id", async () => {
    await createRecruiterEscalation(
      {
        escalationType: "request-new-ad",
        dmName: dmSession.name,
        dmUserId: dmSession.userId,
        territory: "TX",
        territoryStates: ["TX"],
        state: "TX",
        city: "Austin",
        relatedJobId: "job-ad-1",
        jobTitle: "Merchandiser",
      },
      dmSession,
    );
    await createRecruiterEscalation(
      {
        escalationType: "request-recruiter-assignment",
        dmName: otherDmSession.name,
        dmUserId: otherDmSession.userId,
        territory: "CA",
        territoryStates: ["CA"],
        state: "CA",
        city: "Sacramento",
        relatedJobId: "job-assign-1",
        jobTitle: "Reset Lead",
      },
      otherDmSession,
    );

    const mine = await listDmEscalationsForUser(dmSession.userId);
    assert.ok(mine.some((row) => row.escalationType === "request-new-ad"));
    assert.equal(
      mine.some((row) => row.dmUserId === otherDmSession.userId),
      false,
    );

    const all = await listRecruiterEscalations();
    assert.ok(all.length >= 2);
  });
});
