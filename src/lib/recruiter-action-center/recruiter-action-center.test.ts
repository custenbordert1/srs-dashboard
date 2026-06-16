import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthSession } from "@/lib/auth/types";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { normalizeWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import {
  buildRecruiterActionCenterFromRows,
  buildRecruiterActionCenterSnapshot,
  countSmartFilterMatches,
  detectCandidateBottlenecks,
  deriveNextBestAction,
  filterActionCenterRows,
  groupCandidatesIntoQueues,
  mapOneClickActionToWorkflowUpdate,
  matchesSmartFilter,
  pickWorkModeCandidate,
  resolvePriorityBand,
  resolveQueueSection,
  scoreRecruiterActionCenterPriority,
  buildTeamLeaderView,
} from "@/lib/recruiter-action-center";

const REF = Date.parse("2026-06-15T12:00:00.000Z");
const RECRUITER = "Jordan Miles";

function recruiterSession(): AuthSession {
  return {
    userId: "recruiter-user",
    email: "recruiter@example.com",
    name: RECRUITER,
    role: "recruiter",
    territoryStates: ["TX"],
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: patch.candidateId ?? "c1",
    firstName: patch.firstName ?? "Jamie",
    lastName: patch.lastName ?? "Rivera",
    email: "jamie@example.com",
    phone: "555-0100",
    source: "web",
    stage: patch.stage ?? "applied",
    appliedDate: patch.appliedDate ?? "2026-06-14T00:00:00.000Z",
    createdDate: "2026-06-14T00:00:00.000Z",
    addedDate: "2026-06-14T00:00:00.000Z",
    updatedDate: "2026-06-14T00:00:00.000Z",
    addedDateSource: "creation_date",
    positionId: "job-1",
    positionName: patch.positionName ?? "Retail Rep",
    city: patch.city ?? "Houston",
    state: patch.state ?? "TX",
    zipCode: "77001",
    resumeText: "",
    hasResume: false,
    ...patch,
  };
}

function scored(
  patch: Partial<BreezyCandidate> = {},
  workflow?: Parameters<typeof buildScoredWorkflowRow>[1],
) {
  return buildScoredWorkflowRow(sampleCandidate(patch), workflow);
}

function sampleBundle(candidates: BreezyCandidate[]): RecruitingIntelligenceRouteBundle {
  const workflows: RecruitingIntelligenceRouteBundle["workflows"] = {};
  for (const candidate of candidates) {
    workflows[candidate.candidateId] = normalizeWorkflowRecord(candidate.candidateId, {
      assignedRecruiter: RECRUITER,
      recruitingActions: emptyRecruitingActions(),
    });
  }
  return {
    jobs: [],
    jobsResult: { ok: true, jobs: [], fetchedAt: "2026-06-15T12:00:00.000Z" },
    candidates,
    workflows,
    opportunities: [
      {
        opportunityId: "opp-1",
        projectName: "Alpha",
        client: "Client",
        storeAddress: "1 Main",
        storeName: "Store 101",
        city: "Houston",
        state: "TX",
        projectType: "Retail",
        priority: "high",
        openStatus: true,
        territoryOwner: "DM One",
        storeCall: "Open",
        isStaffed: false,
      },
    ],
    coverage: { opportunities: [], generatedAt: "2026-06-15T12:00:00.000Z" },
    melOk: true,
    candidatesResult: {
      ok: true,
      candidates,
      fetchedAt: "2026-06-15T12:00:00.000Z",
      hydrationComplete: true,
      source: "recruiting-intelligence-cache",
    },
    fetchedAt: "2026-06-15T12:00:00.000Z",
    intelligenceCache: {
      cacheStatus: "fresh",
      backgroundRefresh: false,
      refreshedAt: "2026-06-15T12:00:00.000Z",
      ttlMs: 60000,
    },
  };
}

describe("recruiter action center", () => {
  it("scores candidate priority with required bands", () => {
    const melReady = scored({ candidateId: "mel" }, {
      workflowStatus: "Ready for MEL",
      assignedRecruiter: RECRUITER,
      lastActionAt: "2026-06-15T10:00:00.000Z",
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });
    const stale = scored({ candidateId: "stale", appliedDate: "2026-05-01T00:00:00.000Z" }, {
      workflowStatus: "Applied",
      assignedRecruiter: RECRUITER,
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });

    const melScore = scoreRecruiterActionCenterPriority({
      row: melReady,
      opportunities: sampleBundle([]).opportunities,
      referenceMs: REF,
    });
    const staleScore = scoreRecruiterActionCenterPriority({
      row: stale,
      opportunities: sampleBundle([]).opportunities,
      referenceMs: REF,
    });

    assert.ok(melScore >= 70);
    assert.equal(resolvePriorityBand(melScore), melScore >= 90 ? "work-immediately" : "high");
    assert.ok(staleScore < melScore);
    assert.ok(["monitor", "normal", "high"].includes(resolvePriorityBand(staleScore)));
  });

  it("derives next best action with reason and related need", () => {
    const row = scored({}, {
      workflowStatus: "Paperwork Needed",
      assignedRecruiter: RECRUITER,
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });
    const next = deriveNextBestAction({
      row,
      opportunities: sampleBundle([]).opportunities,
      referenceMs: REF,
    });
    assert.equal(next.action, "send-paperwork");
    assert.match(next.reason, /paperwork|packet/i);
    assert.match(next.relatedNeed, /Store|coverage/i);
  });

  it("groups candidates into queue sections", () => {
    const urgent = scored({ candidateId: "urgent" }, {
      workflowStatus: "Ready for MEL",
      assignedRecruiter: RECRUITER,
      lastActionAt: "2026-06-15T10:00:00.000Z",
      recruitingActions: { ...emptyRecruitingActions(), priorityList: true },
      history: [],
    });
    const monitor = scored({ candidateId: "monitor", appliedDate: "2026-05-01T00:00:00.000Z" }, {
      workflowStatus: "Applied",
      assignedRecruiter: RECRUITER,
      recruitingActions: emptyRecruitingActions(),
      history: [],
    });

    const snapshot = buildRecruiterActionCenterFromRows({
      rows: [monitor, urgent],
      opportunities: sampleBundle([]).opportunities,
      actingRecruiter: RECRUITER,
      referenceMs: REF,
      recruiters: [RECRUITER],
    });

    const grouped = groupCandidatesIntoQueues(snapshot.allCandidates);
    assert.ok(grouped["work-now"].some((row) => row.candidateId === "urgent"));
    assert.ok(grouped.monitor.some((row) => row.candidateId === "monitor") || grouped["work-this-week"].some((row) => row.candidateId === "monitor"));
  });

  it("maps one-click workflow updates", () => {
    const update = mapOneClickActionToWorkflowUpdate({
      candidateId: "c1",
      action: "follow-up-complete",
      actingRecruiter: RECRUITER,
    });
    assert.equal(update.queuePayload?.action, "complete-follow-up");

    const assign = mapOneClickActionToWorkflowUpdate({
      candidateId: "c1",
      action: "assign-me",
      actingRecruiter: RECRUITER,
    });
    assert.equal(assign.queuePayload?.action, "assign-recruiter");
  });

  it("builds productivity and recruiter score from cache bundle", () => {
    const bundle = sampleBundle([sampleCandidate()]);
    const snapshot = buildRecruiterActionCenterSnapshot({
      session: recruiterSession(),
      bundle,
      actingRecruiter: RECRUITER,
      referenceMs: REF,
      recruiters: [RECRUITER],
    });

    assert.ok(snapshot.productivity.today);
    assert.ok(snapshot.recruiterScore.score >= 0);
    assert.equal(snapshot.queues["work-now"].length + snapshot.queues.monitor.length, snapshot.allCandidates.length);
  });

  it("ranks team leader rows and highlights support needs", () => {
    const rows = [
      scored({ candidateId: "a" }, {
        workflowStatus: "Qualified",
        assignedRecruiter: "Alex",
        recruitingActions: { ...emptyRecruitingActions(), needsFollowUp: true },
        followUpDueAt: "2026-06-10T00:00:00.000Z",
        history: [],
      }),
      scored({ candidateId: "b" }, {
        workflowStatus: "Ready for MEL",
        assignedRecruiter: RECRUITER,
        lastActionAt: "2026-06-15T10:00:00.000Z",
        recruitingActions: emptyRecruitingActions(),
        history: [],
      }),
    ];

    const team = buildTeamLeaderView({
      rows,
      recruiters: [RECRUITER, "Alex"],
      referenceMs: REF,
    });

    assert.equal(team.length, 2);
    assert.ok(team.some((row) => row.recruiterName === "Alex"));
    assert.ok(team.some((row) => row.highlight === "needs-support" || row.overdueFollowUps > 0));
  });

  it("detects bottleneck badges and smart filters", () => {
    const row = scored({ candidateId: "aging" }, {
      workflowStatus: "Qualified",
      assignedRecruiter: RECRUITER,
      appliedDate: "2026-06-01T00:00:00.000Z",
      recruitingActions: { ...emptyRecruitingActions(), needsFollowUp: true },
      followUpDueAt: "2026-06-10T00:00:00.000Z",
      history: [],
    });
    const badges = detectCandidateBottlenecks(row, REF);
    assert.ok(badges.includes("follow-up-overdue"));

    const snapshot = buildRecruiterActionCenterFromRows({
      rows: [row],
      opportunities: sampleBundle([]).opportunities,
      actingRecruiter: RECRUITER,
      referenceMs: REF,
    });
    const counts = countSmartFilterMatches(snapshot.allCandidates, RECRUITER, REF);
    assert.ok(counts.overdue >= 1);
    const filtered = filterActionCenterRows(snapshot.allCandidates, "overdue", RECRUITER, REF);
    assert.equal(filtered.length, 1);
    assert.equal(matchesSmartFilter(snapshot.allCandidates[0]!, "assigned-to-me", RECRUITER, REF), true);
  });

  it("picks work mode candidate and respects skips", () => {
    const rows = [
      scored({ candidateId: "first" }, {
        workflowStatus: "Ready for MEL",
        assignedRecruiter: RECRUITER,
        recruitingActions: emptyRecruitingActions(),
        history: [],
      }),
      scored({ candidateId: "second" }, {
        workflowStatus: "Paperwork Needed",
        assignedRecruiter: RECRUITER,
        recruitingActions: emptyRecruitingActions(),
        history: [],
      }),
    ];
    const snapshot = buildRecruiterActionCenterFromRows({
      rows,
      opportunities: sampleBundle([]).opportunities,
      actingRecruiter: RECRUITER,
      referenceMs: REF,
      skippedCandidateIds: ["first"],
    });
    assert.equal(snapshot.workMode.nextCandidate?.candidateId, "second");
    assert.equal(pickWorkModeCandidate(snapshot.allCandidates, ["first"])?.candidateId, "second");
  });

  it("resolves queue section from due date and priority", () => {
    assert.equal(
      resolveQueueSection({
        priorityScore: 95,
        priorityBand: "work-immediately",
        dueDate: null,
        referenceMs: REF,
        followUpOverdue: false,
      }),
      "work-now",
    );
    assert.equal(
      resolveQueueSection({
        priorityScore: 40,
        priorityBand: "monitor",
        dueDate: "2026-06-16T12:00:00.000Z",
        referenceMs: REF,
        followUpOverdue: false,
      }),
      "work-today",
    );
  });
});
