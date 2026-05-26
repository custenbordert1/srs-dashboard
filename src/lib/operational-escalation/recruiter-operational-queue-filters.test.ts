import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import {
  buildRecruiterEscalationQueueCounts,
  filterRecruiterEscalations,
} from "@/lib/operational-escalation/recruiter-operational-queue-filters";
import { canTransitionEscalationStatus } from "@/lib/operational-escalation/operational-escalation-store";
import { linkEscalationVariants } from "@/lib/operational-escalation/link-escalation-variants";
import {
  buildSourceEscalationLogId,
  toDmEscalationPublic,
} from "@/lib/operational-escalation/dm-escalation-response";
import {
  escalationAgingBucket,
  matchesEscalationAgingFilter,
  matchesEscalationTerritoryFilter,
} from "@/lib/operational-escalation/recruiter-operational-queue-filters";
import type { JobDraft } from "@/lib/job-management/job-draft-types";

function item(
  overrides: Partial<RecruiterEscalationQueueItem> = {},
): RecruiterEscalationQueueItem {
  return {
    id: "e1",
    escalationType: "request-repost",
    dmName: "Amy Harp",
    dmUserId: "dm-1",
    territory: "TX",
    territoryStates: ["TX"],
    state: "TX",
    city: "Dallas",
    relatedJobId: "job-1",
    jobTitle: "Merchandiser",
    priority: "high",
    priorityScore: 300,
    recommendedAction: "Repost",
    alertReason: "Low flow",
    jobAgeDays: 14,
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
    status: "new",
    internalNotes: [],
    activity: [],
    ...overrides,
  };
}

describe("recruiter operational queue filters", () => {
  it("filters by status tab and priority", () => {
    const rows = [
      item({ id: "a", status: "new", priority: "high" }),
      item({ id: "b", status: "completed", priority: "low" }),
    ];
    const filtered = filterRecruiterEscalations(rows, {
      statusTab: "new",
      priorityFilter: "high",
      territoryState: "all",
      agingFilter: "all",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "a");
  });

  it("filters by territory and aging", () => {
    const old = item({
      id: "old",
      state: "TX",
      createdAt: new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(),
    });
    const recent = item({ id: "recent", state: "OK" });
    assert.equal(matchesEscalationTerritoryFilter(old, "TX"), true);
    assert.equal(matchesEscalationTerritoryFilter(old, "OK"), false);
    assert.equal(escalationAgingBucket(old), "3d");
    assert.equal(matchesEscalationAgingFilter(old, "3d"), true);
    const filtered = filterRecruiterEscalations([old, recent], {
      statusTab: "new",
      priorityFilter: "all",
      territoryState: "TX",
      agingFilter: "3d",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.id, "old");
  });

  it("builds status counts", () => {
    const counts = buildRecruiterEscalationQueueCounts([
      item({ status: "new" }),
      item({ id: "e2", status: "in_review" }),
      item({ id: "e3", status: "new" }),
    ]);
    assert.equal(counts.new, 2);
    assert.equal(counts.in_review, 1);
  });
});

describe("escalation status transitions", () => {
  it("allows review and terminal states from new", () => {
    assert.equal(canTransitionEscalationStatus("new", "in_review"), true);
    assert.equal(canTransitionEscalationStatus("new", "completed"), true);
    assert.equal(canTransitionEscalationStatus("completed", "new"), false);
    assert.equal(canTransitionEscalationStatus("completed", "in_review"), false);
    assert.equal(canTransitionEscalationStatus("dismissed", "completed"), false);
  });
});

describe("dm escalation idempotency and privacy", () => {
  it("uses stable sourceEscalationLogId per dm job and type", () => {
    const a = buildSourceEscalationLogId("dm-1", "job-9", "request-repost");
    const b = buildSourceEscalationLogId("dm-1", "job-9", "request-repost");
    const c = buildSourceEscalationLogId("dm-1", "job-9", "expand-radius");
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it("strips internal notes and activity from DM responses", () => {
    const publicItem = toDmEscalationPublic(
      item({
        internalNotes: ["pay bump discussed"],
        activity: [
          {
            id: "act-1",
            at: new Date().toISOString(),
            actorUserId: "r1",
            actorUserName: "Recruiter",
            actorRole: "recruiter",
            action: "note",
            note: "secret",
          },
        ],
      }),
    );
    assert.equal("internalNotes" in publicItem, false);
    assert.equal("activity" in publicItem, false);
  });
});

describe("link escalation variants", () => {
  it("groups pending and approved unpublished variants", () => {
    const escalation = item({ relatedJobId: "breezy-1", city: "Dallas", state: "TX" });
    const drafts: JobDraft[] = [
      {
        id: "d1",
        status: "draft",
        title: "Variant A",
        description: "",
        city: "Dallas",
        usState: "TX",
        payRate: "$18",
        department: "Ops",
        source: "SRS",
        clonedFromBreezyJobId: "breezy-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        variant: {
          variantGroupId: "g1",
          variantIndex: 0,
          sourceJobId: "breezy-1",
          generatedTitle: "Merch",
          generatedDescriptionHash: "abc",
          cityTarget: "Dallas",
          dmOwner: "Amy Harp",
          queueStatus: "pending",
        },
      },
      {
        id: "d2",
        status: "draft",
        title: "Variant B",
        description: "",
        city: "Fort Worth",
        usState: "TX",
        payRate: "$18",
        department: "Ops",
        source: "SRS",
        clonedFromBreezyJobId: "breezy-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        variant: {
          variantGroupId: "g1",
          variantIndex: 1,
          sourceJobId: "breezy-1",
          generatedTitle: "Merch",
          generatedDescriptionHash: "def",
          cityTarget: "Fort Worth",
          dmOwner: "Amy Harp",
          queueStatus: "approved",
        },
      },
    ];
    const summary = linkEscalationVariants(escalation, drafts);
    assert.equal(summary.pending.length, 1);
    assert.equal(summary.approvedUnpublished.length, 1);
    assert.equal(summary.related.length, 2);
  });
});
