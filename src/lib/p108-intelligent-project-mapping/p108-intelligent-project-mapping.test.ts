import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import {
  clientsMatch,
  extractJobSignals,
  titleSimilarityScore,
} from "@/lib/p108-intelligent-project-mapping/extract-job-signals";
import { buildHistoricalPatterns, historicalPatternBonus } from "@/lib/p108-intelligent-project-mapping/historical-mapping-patterns";
import { recommendCandidateMapping } from "@/lib/p108-intelligent-project-mapping/score-candidate-mapping";
import type { MappingReviewRecord } from "@/lib/p108-intelligent-project-mapping/types";

function job(partial: Partial<BreezyJob> & { jobId: string; name: string }): BreezyJob {
  return {
    city: "Phoenix",
    state: "AZ",
    status: "published",
    zip: "",
    displayLocation: "",
    locationSource: "location",
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    ...partial,
  } as BreezyJob;
}

const row = {
  candidateId: "c1",
  firstName: "Alex",
  lastName: "Rivera",
  email: "alex@example.com",
  positionId: "closed-pos",
  positionName: "Retail Merchandiser — Phoenix, AZ",
  city: "Phoenix",
  state: "AZ",
  appliedDate: new Date().toISOString(),
  assignedRecruiter: "Taylor",
  recruiterAssignmentSource: "auto",
} as never;

describe("p108-intelligent-project-mapping", () => {
  it("extracts client and role signals from titles", () => {
    const signals = extractJobSignals("Continuity Merchandiser SF, Walmart — Phoenix, AZ");
    assert.equal(signals.roleType, "merchandiser");
    assert.ok(signals.client);
    assert.ok(signals.normalizedTitle.includes("phoenix"));
  });

  it("scores exact title matches highly", () => {
    const score = titleSimilarityScore("Solar Installer", "Solar Installer");
    assert.equal(score.points, 25);
    assert.equal(score.matched, true);
  });

  it("detects same client", () => {
    assert.equal(clientsMatch("Walmart", "walmart reset"), true);
    assert.equal(clientsMatch("Target", "Walmart"), false);
  });

  it("auto-maps closed ad with strong location and title match", () => {
    const closed = job({
      jobId: "closed-pos",
      name: "Retail Merchandiser — Phoenix, AZ",
      status: "closed",
      city: "Phoenix",
      state: "AZ",
    });
    const published = job({
      jobId: "pub-1",
      name: "Retail Merchandiser — Phoenix, AZ",
      city: "Phoenix",
      state: "AZ",
    });

    const recommendation = recommendCandidateMapping({
      row,
      closedJob: closed,
      sourcePositionId: "closed-pos",
      publishedJobs: [published],
      historicalPatterns: new Map(),
      melOpportunities: [],
    });

    assert.equal(recommendation.mappingDecision, "AUTO_MAP");
    assert.ok(recommendation.confidenceScore >= 85);
    assert.equal(recommendation.recommendedPositionId, "pub-1");
    assert.ok(recommendation.mappingReason.some((r) => r.includes("Same city")));
    assert.ok(recommendation.mappingReason.some((r) => r.includes("Active posting")));
  });

  it("routes distant same-title match to review", () => {
    const closed = job({
      jobId: "closed-pos",
      name: "Solar Installer",
      status: "closed",
      city: "Phoenix",
      state: "AZ",
    });
    const published = job({
      jobId: "pub-1",
      name: "Solar Installer",
      city: "Dallas",
      state: "TX",
    });

    const recommendation = recommendCandidateMapping({
      row: { ...row, positionName: "Solar Installer", city: "Phoenix", state: "AZ" },
      closedJob: closed,
      sourcePositionId: "closed-pos",
      publishedJobs: [published],
      historicalPatterns: new Map(),
      melOpportunities: [],
    });

    assert.equal(recommendation.mappingDecision, "REVIEW");
    assert.ok(recommendation.confidenceScore >= 50);
    assert.ok(recommendation.mappingReason.some((r) => r.includes("Different city")));
  });

  it("returns no match when titles diverge", () => {
    const closed = job({
      jobId: "closed-pos",
      name: "Unique Role XYZ",
      status: "closed",
      city: "Boston",
      state: "MA",
    });
    const published = job({
      jobId: "pub-1",
      name: "Solar Installer",
      city: "Seattle",
      state: "WA",
    });

    const recommendation = recommendCandidateMapping({
      row: { ...row, positionName: "Unique Role XYZ", city: "Boston", state: "MA" },
      closedJob: closed,
      sourcePositionId: "closed-pos",
      publishedJobs: [published],
      historicalPatterns: new Map(),
      melOpportunities: [],
    });

    assert.equal(recommendation.mappingDecision, "NO_MATCH");
    assert.ok(recommendation.confidenceScore < 50);
  });

  it("boosts score from historical recruiter approvals", () => {
    const records: MappingReviewRecord[] = [
      {
        candidateId: "prev",
        sourcePositionId: "closed-pos",
        recommendedPositionId: "pub-1",
        action: "approve",
        decidedAt: new Date().toISOString(),
        confidenceScore: 90,
      },
    ];
    const patterns = buildHistoricalPatterns(records);
    const bonus = historicalPatternBonus({
      patterns,
      sourcePositionId: "closed-pos",
      recommendedPositionId: "pub-1",
    });
    assert.equal(bonus.matched, true);
    assert.equal(bonus.points, 5);
  });

  it("includes explainability headline", () => {
    const closed = job({
      jobId: "closed-pos",
      name: "Retail Merchandiser — Phoenix, AZ",
      status: "closed",
      city: "Phoenix",
      state: "AZ",
    });
    const published = job({
      jobId: "pub-1",
      name: "Retail Merchandiser — Phoenix, AZ",
      city: "Phoenix",
      state: "AZ",
    });

    const recommendation = recommendCandidateMapping({
      row,
      closedJob: closed,
      sourcePositionId: "closed-pos",
      publishedJobs: [published],
      historicalPatterns: new Map(),
      melOpportunities: [],
    });

    assert.ok(recommendation.explanationHeadline.includes("%"));
    assert.ok(recommendation.factorScores.length >= 10);
  });
});
