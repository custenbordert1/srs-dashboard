import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { CandidateQuestionnaireIntelligence, CandidateReadinessScore, CandidateResumeIntelligence } from "@/lib/candidate-readiness/types";
import type { PlacementCandidateInput } from "@/lib/workforce-placement-intelligence/types";
import {
  buildMarketCapacityPlan,
  buildMarketIntelligenceSnapshot,
  buildPlacementEligibility,
  buildWorkforceMarketRecommendations,
  listActivePriorityMarketOverrides,
  runWorkforcePlacementPreview,
} from "@/lib/workforce-placement-intelligence";

const baseQuestionnaire: CandidateQuestionnaireIntelligence = {
  available: true,
  answers: [],
  merchandisingExperience: "3 years Walmart resets",
  priorVendorExperience: null,
  smartphoneAccess: true,
  internetAccess: true,
  comfortableWithApps: true,
  printerLaptopAccess: true,
  photoUploadComfort: true,
  scheduleUnderstanding: true,
  availabilityNotes: null,
  techReady: true,
  missingAnswers: [],
  readinessChecks: [],
};

const baseResume: CandidateResumeIntelligence = {
  available: true,
  summary: "Retail merchandising experience",
  workHistoryHighlights: [],
  relevantSkills: ["retail"],
  signalBadges: [{ id: "retail", label: "Retail", detected: true }],
  phoneCustomerServiceExperience: null,
  merchandisingRetailExperience: true,
  employmentGaps: [],
  experienceFlags: [],
  quality: {
    employmentHistoryCount: 2,
    longestTenureMonths: 18,
    longestTenureLabel: "18 months",
    employmentGapsDetected: 0,
    completeness: "complete",
    completenessLabel: "Complete",
  },
};

const baseGrade: CandidateReadinessScore = {
  overallScore: 85,
  grade: "B",
  categoryScores: {
    retailMerchandisingExperience: 80,
    reliabilityReadiness: 80,
    technologyReadiness: 85,
    communicationReadiness: 75,
    projectFit: 70,
    paperworkReadiness: 90,
    riskFlags: 90,
  },
  strengths: ["Retail experience detected"],
  concerns: [],
  recommendedNextAction: "Advance to placement preview",
  paperworkReady: true,
  techReady: true,
  confidence: "high",
  confidenceLabel: "High",
  gradeContributors: [],
};

function samplePlacementRow(overrides: Partial<PlacementCandidateInput> = {}): PlacementCandidateInput {
  return {
    candidateId: "c-place",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    city: "Cincinnati",
    state: "OH",
    workflowStatus: "Active Rep",
    paperworkStatus: "signed",
    paperworkError: null,
    questionnaireIntelligence: baseQuestionnaire,
    resumeIntelligence: baseResume,
    candidateGrade: baseGrade,
    skillTags: ["retail_merchandising", "travel_willing"],
    travelFitScore: 85,
    retailExperienceScore: 70,
    merchandisingExperienceScore: 75,
    intelligenceTravelRadius: 90,
    distanceMiles: 12,
    ...overrides,
  };
}

function sampleOpportunity(city: string, state: string): MelOpportunity {
  return {
    opportunityId: `opp-${city}`,
    projectName: `${city} Reset`,
    client: "Walmart",
    storeAddress: "123 Main St",
    storeName: `${city} Store`,
    city,
    state,
    projectType: "Reset",
    priority: "high",
    openStatus: true,
    territoryOwner: "DM",
    storeCall: "Open",
    projectNo: "P-1",
    isStaffed: false,
  };
}

function sampleRep(city: string, state: string, repId: string): ActiveRep {
  return {
    repId,
    name: `Rep ${repId}`,
    city,
    state,
    zip: "00000",
    lat: null,
    lng: null,
    active: true,
    skills: ["merchandising"],
    travelRadius: 50,
    lastProjectDate: null,
    completionRate: 0.9,
    noShowRate: 0.05,
    dmOwner: "DM",
    melStatus: "active",
    trainingStatus: "certified",
    openAssignments: 1,
    completedAssignments: 10,
  };
}

describe("workforce-placement-intelligence", () => {
  it("requires Ready For Work before placement eligibility", () => {
    const row = samplePlacementRow({ workflowStatus: "Paperwork Sent", paperworkStatus: "sent" });
    const eligibility = buildPlacementEligibility({ row });
    assert.equal(eligibility.status, "not_ready_for_work");
    assert.equal(eligibility.readyForWork, false);
  });

  it("routes missing transportation to human review", () => {
    const row = samplePlacementRow({
      candidateGrade: {
        ...samplePlacementRow().candidateGrade,
        gradeContributors: [{ kind: "negative", label: "Transportation not confirmed" }],
      },
      skillTags: [],
      travelFitScore: 0,
      intelligenceTravelRadius: 0,
      distanceMiles: null,
    });
    const eligibility = buildPlacementEligibility({ row });
    assert.equal(eligibility.status, "human_review");
    assert.ok(eligibility.missingReasons.some((reason) => /transportation/i.test(reason)));
  });

  it("calculates market demand scores with priority overrides", () => {
    const opportunities = [
      sampleOpportunity("Cincinnati", "OH"),
      sampleOpportunity("Cincinnati", "OH"),
      sampleOpportunity("Houston", "TX"),
    ];
    const activeReps = [sampleRep("Cincinnati", "OH", "rep-1")];
    const snapshot = buildMarketIntelligenceSnapshot({ opportunities, activeReps });
    assert.ok(snapshot.markets.length >= 2);
    const cincinnati = snapshot.markets.find((row) => row.city === "Cincinnati");
    const houston = snapshot.markets.find((row) => row.city === "Houston");
    assert.ok(cincinnati);
    assert.ok(houston);
    assert.ok((houston?.demandScore ?? 0) >= (cincinnati?.demandScore ?? 0));
    assert.ok(listActivePriorityMarketOverrides().some((row) => row.marketLabel.includes("Houston")));
  });

  it("recommends markets for eligible candidates without assigning projects", () => {
    const row = samplePlacementRow();
    const eligibility = buildPlacementEligibility({ row });
    const opportunities = Array.from({ length: 42 }, (_, index) =>
      sampleOpportunity("Cincinnati", "OH"),
    );
    const activeReps = Array.from({ length: 6 }, (_, index) =>
      sampleRep("Cincinnati", "OH", `rep-${index}`),
    );

    const { recommendations } = buildWorkforceMarketRecommendations({
      candidates: [{ row, eligibility }],
      opportunities,
      activeReps,
    });

    assert.equal(eligibility.status, "eligible");
    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0]?.recommendedMarketLabel, "Cincinnati, OH");
    assert.equal(recommendations[0]?.previewOnly, true);
    assert.ok(recommendations[0]!.confidenceScore >= 40);
    assert.ok(recommendations[0]!.reasoning.length > 0);
  });

  it("recommends all qualified candidates for the same market (tie handling)", () => {
    const rowA = samplePlacementRow({ candidateId: "c-a", firstName: "Alex" });
    const rowB = samplePlacementRow({ candidateId: "c-b", firstName: "Blake" });
    const opportunities = [sampleOpportunity("Cincinnati", "OH")];
    const activeReps: ActiveRep[] = [];

    const { recommendations } = buildWorkforceMarketRecommendations({
      candidates: [
        { row: rowA, eligibility: buildPlacementEligibility({ row: rowA }) },
        { row: rowB, eligibility: buildPlacementEligibility({ row: rowB }) },
      ],
      opportunities,
      activeReps,
    });

    assert.equal(recommendations.length, 2);
    assert.equal(recommendations[0]?.recommendedMarketKey, recommendations[1]?.recommendedMarketKey);
  });

  it("runs preview dashboard without production writes", () => {
    const result = runWorkforcePlacementPreview({
      candidates: [],
      opportunities: [sampleOpportunity("Cincinnati", "OH")],
      activeReps: [],
      fetchedAt: "2026-06-26T12:00:00.000Z",
    });

    assert.equal(result.previewMode, true);
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((warning) => /preview mode/i.test(warning)));
    assert.equal(result.dashboard.previewMode, true);
    assert.equal(result.dashboard.metrics.totalReadyForWork, 0);
    assert.ok(Array.isArray(result.dashboard.workforcePlanning));
  });

  it("plans healthy market capacity when rep coverage is sufficient", () => {
    const opportunities = Array.from({ length: 12 }, (_, index) =>
      sampleOpportunity("Indianapolis", "IN"),
    );
    const activeReps = Array.from({ length: 14 }, (_, index) =>
      sampleRep("Indianapolis", "IN", `rep-${index}`),
    );
    const { markets } = buildMarketIntelligenceSnapshot({ opportunities, activeReps });
    const indianapolis = markets.find((row) => row.city === "Indianapolis");
    assert.ok(indianapolis);
    const plan = buildMarketCapacityPlan(indianapolis!);
    assert.equal(plan.openStoreCount, 12);
    assert.equal(plan.activeRepresentativeCount, 14);
    assert.equal(plan.recommendedNewReps, 0);
    assert.equal(plan.status, "healthy");
    assert.match(plan.reason, /sufficient/i);
  });

  it("plans understaffed market capacity with recommended new reps", () => {
    const opportunities = Array.from({ length: 38 }, (_, index) =>
      sampleOpportunity("Houston", "TX"),
    );
    const activeReps = Array.from({ length: 4 }, (_, index) =>
      sampleRep("Houston", "TX", `rep-${index}`),
    );
    const { markets } = buildMarketIntelligenceSnapshot({ opportunities, activeReps });
    const houston = markets.find((row) => row.city === "Houston");
    assert.ok(houston);
    const plan = buildMarketCapacityPlan(houston!);
    assert.equal(plan.openStoreCount, 38);
    assert.equal(plan.activeRepresentativeCount, 4);
    assert.equal(plan.recommendedNewReps, 8);
    assert.equal(plan.status, "critical");
    assert.match(plan.reason, /coverage|expansion|staffing/i);
  });
});
