import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { JobStatusReconciliationEntry } from "@/lib/breezy-job-status-reconciliation/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import {
  buildCandidateTrace,
  buildMetricsFromTraces,
} from "@/lib/published-job-gate-audit/classify-primary-blocker";
import type {
  PublishedJobAuditEntry,
  PublishedJobGateAuditReport,
  PublishedJobGateTrace,
} from "@/lib/published-job-gate-audit/types";
import { P93_PREVIEW_MODE, P93_SOURCE_PHASE } from "@/lib/published-job-gate-audit/types";
import { buildRecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";

function buildOwnershipIndex(
  workflows: Record<string, CandidateWorkflowRecord>,
  rows: ScoredCandidateWorkflowRow[],
): Map<string, { total: number; byState: Map<string, number> }> {
  const index = new Map<string, { total: number; byState: Map<string, number> }>();
  for (const row of rows) {
    const workflow = workflows[row.candidateId];
    const recruiter = workflow?.assignedRecruiter?.trim() ?? row.assignedRecruiter;
    if (!recruiter || recruiter === "Unassigned") continue;
    const bucket = index.get(recruiter) ?? { total: 0, byState: new Map() };
    bucket.total += 1;
    const state = row.state?.trim();
    if (state) bucket.byState.set(state, (bucket.byState.get(state) ?? 0) + 1);
    index.set(recruiter, bucket);
  }
  return index;
}

function buildNextOperationalFix(metrics: PublishedJobGateAuditReport["metrics"]): string[] {
  const steps: string[] = [];
  if (metrics.candidatesBlockedByP62 > 0) {
    steps.push(`Assign recruiters (P62) for ${metrics.candidatesBlockedByP62} candidate(s) on published jobs.`);
  }
  if (metrics.primaryBlockerCounts.missing_dm_assignment > 0) {
    steps.push(
      `Assign DM territory owners for ${metrics.primaryBlockerCounts.missing_dm_assignment} candidate(s).`,
    );
  }
  if (metrics.primaryBlockerCounts.data_stale_cache_issue > 0) {
    steps.push(
      `Refresh published jobs cache — ${metrics.primaryBlockerCounts.data_stale_cache_issue} candidate(s) have live published jobs missing from list index.`,
    );
  }
  if (metrics.candidatesBlockedByP83 > 0) {
    steps.push(
      `Run P83 advancement preview + persist for ${metrics.candidatesBlockedByP83} candidate(s) still in Applied/screen stage.`,
    );
  }
  if (metrics.candidatesBlockedByP84 > 0) {
    steps.push(
      `Resolve P84 workflow gates for ${metrics.candidatesBlockedByP84} candidate(s) (Paperwork Needed + send-paperwork).`,
    );
  }
  if (metrics.candidatesP84EligibleNow > 0) {
    steps.push(
      `${metrics.candidatesP84EligibleNow} candidate(s) are P84-eligible now — run P84 preview only (liveSend off).`,
    );
  }
  if (steps.length === 0) {
    steps.push("No operational fixes identified for published-job candidates.");
  }
  steps.push("Do not enable liveSend until executive approval.");
  return steps;
}

export function buildPublishedJobGateAudit(input: {
  publishedJobEntries: JobStatusReconciliationEntry[];
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, BreezyJob>;
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  paperworkByGrade: PaperworkByGrade;
  mtdRangeLabel?: string;
  generatedAt?: string;
}): PublishedJobGateAuditReport {
  const ownership = buildOwnershipIndex(input.workflows, [...input.rowsByCandidateId.values()]);
  const publishedJobs: PublishedJobAuditEntry[] = [];
  const allTraces: PublishedJobGateTrace[] = [];

  for (const jobEntry of input.publishedJobEntries) {
    const traces: PublishedJobGateTrace[] = [];
    const liveJobPublished = jobEntry.resolvedStatus === "published";

    for (const candidateId of jobEntry.blockedCandidateIds) {
      const row = input.rowsByCandidateId.get(candidateId);
      if (!row) continue;

      const workflow = input.workflows[candidateId];
      const assignment = buildRecruiterAssignmentDecision({
        candidate: row,
        workflow,
        jobState: jobEntry.state,
        rosters: input.rosters,
        ownership,
      });

      const trace = buildCandidateTrace({
        row,
        jobEntry,
        jobsByPositionId: input.jobsByPositionId,
        onboarding: input.onboardingByCandidateId.get(candidateId) ?? null,
        paperworkByGrade: input.paperworkByGrade,
        recommendedRecruiter: assignment.recruiter,
        assignmentConfidence: assignment.confidence,
        liveJobPublished,
      });
      traces.push(trace);
      allTraces.push(trace);
    }

    publishedJobs.push({
      positionId: jobEntry.positionId,
      jobTitle: jobEntry.jobTitle,
      city: jobEntry.city,
      state: jobEntry.state,
      liveBreezyStatus: jobEntry.breezyPipelineStatus,
      candidateCount: traces.length,
      traces,
    });
  }

  const metrics = buildMetricsFromTraces(allTraces);
  const exampleTraces = allTraces.slice(0, 5);

  return {
    sourcePhase: P93_SOURCE_PHASE,
    previewMode: P93_PREVIEW_MODE,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    sectionTitle: "Published Job Downstream Gate Audit",
    metrics,
    publishedJobs,
    exampleTraces,
    nextOperationalFix: buildNextOperationalFix(metrics),
    remainingBlockersBeforeP84Unlock: [
      "P93 is preview-only — no Breezy writes and no live P84 sends",
      `${metrics.candidatesBlockedByP62} candidate(s) blocked by missing recruiter (P62)`,
      `${metrics.primaryBlockerCounts.missing_dm_assignment} candidate(s) blocked by missing DM assignment`,
      `${metrics.candidatesBlockedByP83} candidate(s) blocked by Applied stage / P83 non-advancement`,
      `${metrics.candidatesBlockedByP84} candidate(s) blocked by P84 workflow gates or mapping/cache`,
      `${metrics.candidatesAlreadyPaperworkSent} candidate(s) already have paperwork in flight`,
      `${metrics.candidatesShouldRemainBlocked} candidate(s) should remain blocked (terminal/duplicate/mapping)`,
      `${metrics.candidatesFixableWithoutBreezyJobAction} candidate(s) fixable without any Breezy job publish action`,
      "P84 liveSend must remain disabled until executive sign-off",
    ],
  };
}

export async function buildPublishedJobGateAuditFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<PublishedJobGateAuditReport> {
  const { buildBreezyJobStatusReconciliationFromStores } = await import(
    "@/lib/breezy-job-status-reconciliation"
  );
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

  const [p92, store, bundle, jobsResult, onboardingRecords, policy] = await Promise.all([
    buildBreezyJobStatusReconciliationFromStores(input),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
  ]);

  const publishedJobEntries = p92.entries.filter((entry) => entry.resolvedStatus === "published");
  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );

  for (const entry of publishedJobEntries) {
    if (!jobsByPositionId.has(entry.positionId) && entry.liveFetchSucceeded) {
      jobsByPositionId.set(entry.positionId, {
        jobId: entry.positionId,
        name: entry.jobTitle,
        city: entry.city,
        state: entry.state,
        zip: "",
        displayLocation: `${entry.city}, ${entry.state}`.replace(/^, |, $/g, ""),
        locationSource: "missing",
        status: entry.breezyPipelineStatus || "published",
        createdDate: "",
        updatedDate: "",
      });
    }
  }

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
  const rowsByCandidateId = new Map(rows.map((row) => [row.candidateId, row]));

  return buildPublishedJobGateAudit({
    publishedJobEntries,
    rowsByCandidateId,
    jobsByPositionId,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    onboardingByCandidateId: new Map(onboardingRecords.map((r) => [r.candidateId, r])),
    paperworkByGrade: policy.paperworkByGrade,
    mtdRangeLabel: `${range.start}..${range.end}`,
  });
}
