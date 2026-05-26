import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  assertRecommendationsOnly,
  buildRecruiterDecisionIntelligence,
  dedupeRecruiterSuggestedActions,
} from "@/lib/recruiting-decision-intelligence";
import { buildCoverageRecommendations } from "@/lib/recruiting-decision-intelligence/coverage-recommendation-engine";
import { buildTerritoryIntelligenceSnapshot } from "@/lib/recruiting-decision-intelligence/territory-intelligence";
import { buildVariantPerformanceRows } from "@/lib/recruiting-decision-intelligence/variant-performance";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import type { RecruiterSuggestedAction } from "@/lib/recruiting-decision-intelligence/types";

const referenceIso = "2026-05-20T12:00:00.000Z";

function job(overrides: Partial<BreezyJob> = {}): BreezyJob {
  return {
    jobId: "job-dallas",
    friendlyId: "job-dallas",
    name: "Merchandiser",
    city: "Dallas",
    state: "TX",
    createdDate: "2026-04-01T00:00:00.000Z",
    updatedDate: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c1",
    name: "Applicant",
    email: "a@example.com",
    phone: "",
    city: "Dallas",
    state: "TX",
    stage: "Applied",
    appliedDate: "2026-05-18T00:00:00.000Z",
    positionId: "job-dallas",
    positionName: "Merchandiser",
    source: "Indeed",
    ...overrides,
  };
}

describe("recruiting decision intelligence", () => {
  it("ranks variant performance and marks best performer", () => {
    const drafts: JobDraft[] = [
      {
        id: "d1",
        status: "pushed",
        title: "Variant Dallas",
        description: "",
        city: "Dallas",
        usState: "TX",
        payRate: "$18",
        department: "Ops",
        source: "SRS",
        breezyJobId: "job-dallas",
        clonedFromBreezyJobId: "job-dallas",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
        variant: {
          variantGroupId: "g1",
          variantIndex: 0,
          sourceJobId: "job-dallas",
          generatedTitle: "Merch",
          generatedDescriptionHash: "abc",
          cityTarget: "Dallas",
          dmOwner: "Amy",
          queueStatus: "published",
        },
      },
      {
        id: "d2",
        status: "draft",
        title: "Variant FW",
        description: "",
        city: "Fort Worth",
        usState: "TX",
        payRate: "$18",
        department: "Ops",
        source: "SRS",
        clonedFromBreezyJobId: "job-dallas",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
        variant: {
          variantGroupId: "g1",
          variantIndex: 1,
          sourceJobId: "job-dallas",
          generatedTitle: "Merch",
          generatedDescriptionHash: "def",
          cityTarget: "Fort Worth",
          dmOwner: "Amy",
          queueStatus: "pending",
        },
      },
    ];
    const rows = buildVariantPerformanceRows(
      drafts,
      [job()],
      [candidate(), candidate({ candidateId: "c2", stage: "Hired" })],
      referenceIso,
    );
    assert.ok(rows.some((row) => row.marker === "best"));
    assert.ok(rows.some((row) => row.marker === "aging" || row.queueStatus === "pending"));
  });

  it("dedupes suggested actions by type and job", () => {
    const actions: RecruiterSuggestedAction[] = [
      {
        id: "a1",
        type: "repost",
        title: "Repost A",
        reason: "r1",
        impactEstimate: "i1",
        urgency: "medium",
        jobId: "job-1",
        manualOnly: true,
      },
      {
        id: "a2",
        type: "repost",
        title: "Repost B",
        reason: "r2",
        impactEstimate: "i2",
        urgency: "critical",
        jobId: "job-1",
        manualOnly: true,
      },
    ];
    const deduped = dedupeRecruiterSuggestedActions(actions);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]?.urgency, "critical");
  });

  it("builds territory intelligence summaries", () => {
    const territory = buildTerritoryIntelligenceSnapshot({
      territoryLabel: "TX",
      territoryStates: ["TX"],
      jobs: [job(), job({ jobId: "job-fw", city: "Fort Worth", friendlyId: "job-fw" })],
      candidates: [
        candidate(),
        candidate({ candidateId: "c-fw", positionId: "job-fw", city: "Fort Worth" }),
      ],
      escalations: [],
      referenceIso,
    });
    assert.ok(territory.strongestMarkets.length > 0);
    assert.ok(territory.topRiskCities.length > 0);
  });

  it("scores coverage recommendations for high-risk jobs", () => {
    const coverage = buildCoverageRecommendations({
      jobs: [job()],
      candidates: [],
      drafts: [],
      escalations: [],
      activeReps: [],
      referenceIso,
      limit: 5,
    });
    assert.ok(coverage.length >= 1);
    assert.ok(coverage[0]!.summaryBullets.length > 0);
  });

  it("never enables recruiter automation flags", () => {
    const snapshot = buildRecruiterDecisionIntelligence({
      territoryLabel: "TX",
      territoryStates: ["TX"],
      jobs: [job()],
      candidates: [candidate()],
      drafts: [],
      escalations: [],
      activeReps: [],
      fetchedAt: referenceIso,
    });
    assert.equal(assertRecommendationsOnly(snapshot.suggestedActions), true);
    assert.equal(snapshot.suggestedActions.every((row) => row.manualOnly === true), true);
  });
});
