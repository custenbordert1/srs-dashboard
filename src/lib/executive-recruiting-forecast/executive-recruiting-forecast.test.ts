import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord, CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  buildDmCapacityRows,
  buildExecutiveForecastRecommendations,
  buildExecutiveRecruitingForecastSnapshot,
  buildHiringForecastHorizons,
  buildRecruiterCapacityRows,
  buildTerritoryShortageForecast,
  buildWeeklyHireForecast,
} from "@/lib/executive-recruiting-forecast";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";

const now = new Date().toISOString();

function candidate(id: string, state = "TX"): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Test",
    lastName: id,
    email: `${id}@example.com`,
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate: now,
    createdDate: now,
    addedDate: now,
    updatedDate: now,
    addedDateSource: "creation_date",
    positionId: "job-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state,
    zipCode: "",
    resumeText: "",
    tags: [],
  };
}

function workflowRecord(candidateId: string, recruiter = "Alex"): CandidateWorkflowRecord {
  return {
    candidateId,
    workflowStatus: "Applied",
    notes: [],
    assignedRecruiter: recruiter,
    assignedDM: "DM One",
    lastActionAt: now,
    nextActionNeeded: "Review",
    history: [],
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: null,
    paperworkTemplateKey: null,
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: "not_sent",
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_sent",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: now,
  };
}

function intelligenceStub(): RecruitingIntelligenceSnapshot {
  return {
    territoryLabel: "Nationwide",
    territoryStates: [],
    fetchedAt: now,
    jobRankings: [],
    topCandidatesTerritory: [],
    suggestedActions: [],
    smartAlerts: [],
    recruitingAlerts: [],
    recommendations: [],
    candidateIntelligence: { profiles: [], bestFitCandidates: [], averageScore: 0, scoredCount: 0 },
    executiveInsights: {
      fillRiskScore: 40,
      fillRiskLabel: "Watch",
      territoryHealthScore: 70,
      territoryHealthLabel: "Stable",
      recruiterProductivityScore: 70,
      pipelineVelocity: 10,
      applicantsPerOpening: 2,
      conversionFunnel: [],
      hiringMomentumTrend: [],
      activeJobs: 1,
      totalCandidates: 1,
      candidatesLast7Days: 1,
      interviewsActive: 1,
      hiresYtd: 1,
    },
    productivity: [
      {
        recruiter: "Alex",
        candidatesReviewed: 2,
        paperworkSent: 0,
        avgResponseDays: 1,
        workflowAgingDays: 1,
        hires: 0,
        interviewsScheduled: 0,
        conversionPercent: 10,
        responseSpeedLabel: "Fast",
      },
    ],
    trends: {
      applicantsPerDay: [],
      hiresPerWeek: [],
      sourceConversion: [],
      territoryFillVelocity: [],
    },
    dailySnapshot: {
      generatedAt: now,
      totalApplicants: 1,
      applicantsLast7Days: 1,
      hottestTerritories: [],
      highestRiskTerritories: [],
      bestRecruitingSources: [],
      projectedFillRisks: [],
      summaryBullets: [],
    },
    automationHooks: [],
    executiveAutomationRollups: {
      recruiterCapacityRisk: null,
      pipelineBlockers: [],
      automationOpportunities: [],
    },
  };
}

function opportunity(state: string, dm: string): MelOpportunity {
  return {
    opportunityId: `${state}-${dm}`,
    projectName: "Reset",
    client: "Client",
    storeAddress: "1 Main",
    storeName: "Store",
    city: "Dallas",
    state,
    projectType: "Reset",
    priority: "high",
    openStatus: true,
    territoryOwner: dm,
    storeCall: "Open",
    projectNo: "P-100",
    isStaffed: false,
  };
}

describe("executive-recruiting-forecast", () => {
  it("builds 30/60/90 hiring horizons with rising applicant projections", () => {
    const workflows: CandidateWorkflowState = { c1: { ...workflowRecord("c1"), workflowStatus: "Ready for MEL" } };
    const rows = buildHiringForecastHorizons({
      candidates: [candidate("c1"), candidate("c2")],
      workflows,
      publishedJobCount: 20,
      fetchedAt: now,
      partialSync: false,
    });
    assert.equal(rows.length, 3);
    assert.ok(rows[2]!.projectedApplicants >= rows[0]!.projectedApplicants);
  });

  it("distributes weekly hire forecast across 13 weeks", () => {
    const weeks = buildWeeklyHireForecast({ projectedHires90: 9, pipelineBacklog: 40 });
    assert.equal(weeks.length, 13);
    const total = weeks.reduce((sum, row) => sum + row.projectedHires, 0);
    assert.ok(Math.abs(total - 9) < 0.5);
  });

  it("classifies overloaded recruiter capacity when backlog is high", () => {
    const workflows: CandidateWorkflowState = {};
    const candidates: BreezyCandidate[] = [];
    for (let i = 0; i < 30; i += 1) {
      const id = `c-${i}`;
      candidates.push(candidate(id));
      workflows[id] = workflowRecord(id, "Alex");
    }
    const rows = buildRecruiterCapacityRows({
      candidates,
      jobs: [{ jobId: "j1" } as never],
      workflows,
      productivityRows: [{ recruiter: "Alex", candidatesReviewed: 30 }],
    });
    const alex = rows.find((row) => row.recruiter === "Alex");
    assert.ok(alex);
    assert.equal(alex.status, "overloaded");
  });

  it("ranks territory shortages for markets likely to miss coverage", () => {
    const rows = buildTerritoryShortageForecast({
      candidates: [candidate("c1", "TX"), candidate("c2", "TX")],
      workflows: { c1: workflowRecord("c1") },
      opportunities: [opportunity("TX", "DM One"), opportunity("TX", "DM One"), opportunity("TX", "DM One")],
    });
    assert.ok(rows.length > 0);
    assert.ok(rows[0]!.shortageScore > 0);
  });

  it("builds executive recommendations from shortage and capacity signals", () => {
    const recs = buildExecutiveForecastRecommendations({
      territoryShortages: [
        {
          dmName: "DM One",
          territoryLabel: "TX",
          shortageScore: 80,
          projectedShortage: 4,
          openOpportunities: 6,
          activeReps: 0,
          pipelineCandidates: 1,
          likelyMissCoverage: true,
          reasons: ["No active reps in territory"],
        },
      ],
      recruiterCapacity: [
        {
          recruiter: "Alex",
          capacityScore: 30,
          status: "overloaded",
          assignedCandidates: 30,
          openFollowUps: 2,
          overdueFollowUps: 2,
          candidateBacklogPressure: 90,
          openJobPressure: 50,
        },
      ],
      dmCapacity: [],
      projectedApplicantShortage: 20,
    });
    assert.ok(recs.some((row) => row.kind === "escalate-dm-territory"));
    assert.ok(recs.some((row) => row.kind === "move-recruiter-focus"));
    assert.ok(recs[0]!.priority === "critical" || recs[0]!.priority === "high");
  });

  it("builds full executive snapshot with KPIs", () => {
    const snapshot = buildExecutiveRecruitingForecastSnapshot({
      jobs: [{ jobId: "j1" } as never],
      candidates: [candidate("c1")],
      workflows: { c1: { ...workflowRecord("c1"), workflowStatus: "Active Rep" } },
      opportunities: [opportunity("TX", "DM One")],
      intelligence: intelligenceStub(),
      fetchedAt: now,
      partialSync: false,
    });
    assert.ok(snapshot.kpis.projectedHires30 >= 0);
    assert.equal(snapshot.hiringForecasts.length, 3);
    assert.ok(snapshot.assumptions.length >= 3);
    assert.ok(snapshot.executiveSummary.narrative.length > 0);
    assert.ok(["low", "moderate", "high"].includes(snapshot.forecastConfidence));
    assert.ok(snapshot.projectCompletionRisks.every((row) => row.suggestedAction.length > 0));
  });

  it("flags DM capacity pressure from open opportunities", () => {
    const rows = buildDmCapacityRows({
      candidates: [candidate("c1", "TX")],
      workflows: { c1: workflowRecord("c1") },
      opportunities: Array.from({ length: 8 }, () => opportunity("TX", "DM One")),
    });
    const dm = rows.find((row) => row.dmName === "DM One");
    assert.ok(dm);
    assert.ok(["overloaded", "stable", "underused"].includes(dm.status));
  });
});
