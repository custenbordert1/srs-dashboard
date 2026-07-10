import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import type { PublishedJobGateTrace } from "@/lib/published-job-gate-audit/types";
import {
  RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD,
} from "@/lib/recruiter-assignment-engine/types";
import { buildRecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type {
  AssignmentPreviewOutcome,
  AssignmentPreviewRiskLevel,
  P62AssignmentPreviewEntry,
  P62AssignmentPreviewMetrics,
  P62AssignmentPreviewReport,
  RecruiterDistributionEntry,
} from "@/lib/p62-assignment-preview/types";
import { P94_PREVIEW_MODE, P94_SOURCE_PHASE } from "@/lib/p62-assignment-preview/types";
import { simulateDownstreamAfterAssignment } from "@/lib/p62-assignment-preview/simulate-downstream";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";

function resolveRisk(confidence: number, shouldAssign: boolean): AssignmentPreviewRiskLevel {
  if (!shouldAssign) return "high";
  if (confidence >= 80) return "low";
  return "medium";
}

function buildWorkloadFactor(input: {
  recruiter: string;
  territoryState: string | null;
  ownership: Map<string, { total: number; byState: Map<string, number> }>;
}): string {
  if (!input.recruiter) return "No recruiter selected.";
  const owned = input.ownership.get(input.recruiter) ?? { total: 0, byState: new Map() };
  const stateOwned = input.territoryState ? (owned.byState.get(input.territoryState) ?? 0) : 0;
  return `${owned.total} total candidates owned; ${stateOwned} in ${input.territoryState ?? "territory"}.`;
}

function buildOwnershipIndex(
  workflows: Record<string, CandidateWorkflowRecord>,
  rows: ScoredCandidateWorkflowRow[],
): Map<string, { total: number; byState: Map<string, number> }> {
  const index = new Map<string, { total: number; byState: Map<string, number> }>();
  for (const row of rows) {
    const workflow = workflows[row.candidateId];
    const recruiter = workflow?.assignedRecruiter?.trim() ?? row.assignedRecruiter;
    if (isUnassignedRecruiter(recruiter)) continue;
    const bucket = index.get(recruiter) ?? { total: 0, byState: new Map() };
    bucket.total += 1;
    const state = row.state?.trim();
    if (state) bucket.byState.set(state, (bucket.byState.get(state) ?? 0) + 1);
    index.set(recruiter, bucket);
  }
  return index;
}

function buildEntry(input: {
  trace: PublishedJobGateTrace;
  row: ScoredCandidateWorkflowRow;
  jobTitle: string;
  city: string;
  state: string;
  assignment: ReturnType<typeof buildRecruiterAssignmentDecision>;
  workloadBalanceFactor: string;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
  paperworkByGrade: PaperworkByGrade;
}): P62AssignmentPreviewEntry {
  const outcome: AssignmentPreviewOutcome = input.assignment.shouldAssign ? "assignable" : "human_review";
  const recommendedRecruiter = input.assignment.recruiter || "Unassigned";
  const downstream = simulateDownstreamAfterAssignment({
    row: input.row,
    assignedRecruiter: recommendedRecruiter,
    jobsByPositionId: input.jobsByPositionId,
    onboarding: input.onboarding,
    paperworkByGrade: input.paperworkByGrade,
    assignmentApplied: input.assignment.shouldAssign,
  });

  return {
    candidateId: input.trace.candidateId,
    candidateName: input.trace.candidateName,
    positionId: input.trace.positionId,
    jobTitle: input.jobTitle,
    city: input.city,
    state: input.state,
    dmTerritory: input.trace.dmTerritory,
    suggestedDm: input.trace.suggestedDm,
    currentRecruiter: input.trace.recruiter.assigned,
    recommendedRecruiter,
    assignmentReason: input.assignment.reason,
    workloadBalanceFactor: input.workloadBalanceFactor,
    confidence: input.assignment.confidence,
    riskLevel: resolveRisk(input.assignment.confidence, input.assignment.shouldAssign),
    outcome,
    humanReviewReason: outcome === "human_review" ? input.assignment.reason : null,
    downstream,
    manualApprovalRequired: true,
  };
}

function buildMetrics(entries: P62AssignmentPreviewEntry[]): P62AssignmentPreviewMetrics {
  return {
    candidatesReviewed: entries.length,
    candidatesAssignable: entries.filter((e) => e.outcome === "assignable").length,
    candidatesNeedingHumanReview: entries.filter((e) => e.outcome === "human_review").length,
    candidatesExpectedPaperworkNeeded: entries.filter(
      (e) => e.downstream.expectedWorkflowStatus === "Paperwork Needed",
    ).length,
    candidatesExpectedP84Eligible: entries.filter((e) => e.downstream.p84EligibleAfterSimulation).length,
    candidatesStillBlockedAfterAssignment: entries.filter((e) => e.downstream.stillBlockedAfterAssignment).length,
  };
}

function buildRecruiterDistribution(entries: P62AssignmentPreviewEntry[]): RecruiterDistributionEntry[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.outcome !== "assignable") continue;
    counts.set(entry.recommendedRecruiter, (counts.get(entry.recommendedRecruiter) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([recruiter, candidateCount]) => ({ recruiter, candidateCount }))
    .sort((a, b) => b.candidateCount - a.candidateCount || a.recruiter.localeCompare(b.recruiter));
}

export function buildP62AssignmentPreview(input: {
  cohortTraces: PublishedJobGateTrace[];
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  jobMetaByPositionId: Map<string, { jobTitle: string; city: string; state: string }>;
  jobsByPositionId: Map<string, BreezyJob>;
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  paperworkByGrade: PaperworkByGrade;
  mtdRangeLabel?: string;
  generatedAt?: string;
}): P62AssignmentPreviewReport {
  const allRows = [...input.rowsByCandidateId.values()];
  const ownership = buildOwnershipIndex(input.workflows, allRows);
  const entries: P62AssignmentPreviewEntry[] = [];

  for (const trace of input.cohortTraces) {
    const row = input.rowsByCandidateId.get(trace.candidateId);
    if (!row) continue;

    const meta = input.jobMetaByPositionId.get(trace.positionId) ?? {
      jobTitle: trace.jobTitle,
      city: row.city,
      state: row.state,
    };

    const assignment = buildRecruiterAssignmentDecision({
      candidate: row,
      workflow: input.workflows[trace.candidateId],
      jobState: meta.state,
      rosters: input.rosters,
      ownership,
    });

    entries.push(
      buildEntry({
        trace,
        row,
        jobTitle: meta.jobTitle,
        city: meta.city,
        state: meta.state,
        assignment,
        workloadBalanceFactor: buildWorkloadFactor({
          recruiter: assignment.recruiter,
          territoryState: assignment.territoryState,
          ownership,
        }),
        jobsByPositionId: input.jobsByPositionId,
        onboarding: input.onboardingByCandidateId.get(trace.candidateId) ?? null,
        paperworkByGrade: input.paperworkByGrade,
      }),
    );
  }

  const metrics = buildMetrics(entries);
  const recruiterDistribution = buildRecruiterDistribution(entries);

  return {
    sourcePhase: P94_SOURCE_PHASE,
    previewMode: P94_PREVIEW_MODE,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    sectionTitle: "Recruiter Assignment Preview",
    cohortLabel: "P93 published-job candidates blocked by missing recruiter assignment only",
    metrics,
    recruiterDistribution,
    entries,
    sampleTraces: entries.slice(0, 5),
    remainingBlockersBeforeAutonomousPaperwork: [
      "P94 is preview-only — no workflow writes and no live P84 sends",
      `${metrics.candidatesAssignable} candidate(s) have auto-assignable P62 recommendations (confidence ≥ ${RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD})`,
      `${metrics.candidatesNeedingHumanReview} candidate(s) need human recruiter review`,
      `${metrics.candidatesExpectedP84Eligible} candidate(s) expected P84-eligible after simulated P62 + P83 (liveSend off)`,
      `${metrics.candidatesStillBlockedAfterAssignment} candidate(s) still blocked after simulated assignment`,
      "Manual approval required before persisting any recruiter assignment",
      "14 closed Breezy jobs still need reactivation for remaining unlock cohort (outside P94 scope)",
      "P84 liveSend must remain disabled until executive sign-off",
    ],
  };
}

export async function buildP62AssignmentPreviewFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<P62AssignmentPreviewReport> {
  const { buildPublishedJobGateAuditFromStores } = await import("@/lib/published-job-gate-audit");
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadCandidateOnboardingPolicy } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-policy-store"
  );

  const [p93, store, bundle, jobsResult, onboardingRecords, policy] = await Promise.all([
    buildPublishedJobGateAuditFromStores(input),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
  ]);

  const cohortTraces = p93.publishedJobs.flatMap((job) =>
    job.traces.filter((trace) => trace.primaryBlocker === "missing_recruiter_assignment"),
  );

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  for (const job of p93.publishedJobs) {
    if (!jobsByPositionId.has(job.positionId)) {
      jobsByPositionId.set(job.positionId, {
        jobId: job.positionId,
        name: job.jobTitle,
        city: job.city,
        state: job.state,
        zip: "",
        displayLocation: `${job.city}, ${job.state}`.replace(/^, |, $/g, ""),
        locationSource: "missing",
        status: job.liveBreezyStatus || "published",
        createdDate: "",
        updatedDate: "",
      });
    }
  }

  const jobMetaByPositionId = new Map(
    p93.publishedJobs.map((job) => [
      job.positionId,
      { jobTitle: job.jobTitle, city: job.city, state: job.state },
    ]),
  );

  const range = currentMtdDateRange();
  const candidates =
    input?.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);

  const rows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  return buildP62AssignmentPreview({
    cohortTraces,
    rowsByCandidateId: new Map(rows.map((row) => [row.candidateId, row])),
    jobMetaByPositionId,
    jobsByPositionId,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    onboardingByCandidateId: new Map(onboardingRecords.map((r) => [r.candidateId, r])),
    paperworkByGrade: policy.paperworkByGrade,
    mtdRangeLabel: `${range.start}..${range.end}`,
  });
}
