import type { BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { P185CursorState } from "@/lib/p185-production-paperwork-automation-runner/types";

export const P185_CANDIDATE_SOURCE_MAPPING: Array<{
  source: string;
  target: string;
  fallback: string;
}> = [
  {
    source: "Breezy/ingestion candidateId",
    target: "ScoredCandidateWorkflowRow.candidateId",
    fallback: "Skip candidate — missing id is not eligibility proof",
  },
  {
    source: "candidate.stage / workflowStatus",
    target: "row.stage / row.workflowStatus",
    fallback: "Treat as unknown stage; P184 gates decide eligibility",
  },
  {
    source: "candidate.email / onboardingContactEmail",
    target: "row.email",
    fallback: "Empty email fails P184 valid_email gate — never assume eligible",
  },
  {
    source: "archived / withdrawn flags on ingestion or workflow",
    target: "row notes + stage signals consumed by P184 not_archived",
    fallback: "Missing archive flag ≠ active; P184 requires positive clear signals",
  },
  {
    source: "candidate.positionId + Breezy published jobs",
    target: "row.positionId + jobsByPositionId",
    fallback: "Missing job → P184 job_active/position_accepting fail closed",
  },
  {
    source: "job open/closed (Breezy published list)",
    target: "BreezyJob in jobsByPositionId",
    fallback: "Unpublished/missing job is not treated as open",
  },
  {
    source: "P184 highDemandPositionIds / executivePriorityJobIds",
    target: "queue priority only (not eligibility)",
    fallback: "Default demand/priority scores when unset",
  },
  {
    source: "CandidateOnboardingRecord",
    target: "onboardingByCandidateId",
    fallback: "null onboarding → P184 evaluates as not yet sent",
  },
  {
    source: "onboarding.signatureRequestId / paperworkStatus",
    target: "Dropbox envelope + paperwork history for P184 gates",
    fallback: "Missing envelope ≠ safe to send; duplicate gates still apply",
  },
  {
    source: "updatedDate / stage change timestamps",
    target: "cursor watermark + updated-since filter",
    fallback: "Full reconciliation when cursor stale or cadence due",
  },
];

export type P185CandidateSourceResult = {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  cursor: P185CursorState;
  continuationToken: string | null;
  exhausted: boolean;
  sourceHealthy: boolean;
  sourceDetail: string;
  scanned: number;
  fullReconciliation: boolean;
};

function candidateSortKey(row: ScoredCandidateWorkflowRow): string {
  return `${row.updatedDate || row.addedDate || row.createdDate || ""}|${row.candidateId}`;
}

export async function loadLiveP185Candidates(input: {
  cursor: P185CursorState;
  maxCandidates: number;
  fullReconciliationIntervalMs: number;
  nowMs?: number;
  /** Injected for tests */
  deps?: {
    readIngestionStore?: typeof readIngestionStore;
    getCandidateWorkflowBundle?: typeof getCandidateWorkflowBundle;
    fetchBreezyJobs?: typeof fetchBreezyJobs;
    listAllCandidateOnboardingRecords?: typeof listAllCandidateOnboardingRecords;
  };
}): Promise<P185CandidateSourceResult> {
  const nowMs = input.nowMs ?? Date.now();
  const deps = input.deps ?? {};
  const readStore = deps.readIngestionStore ?? readIngestionStore;
  const getBundle = deps.getCandidateWorkflowBundle ?? getCandidateWorkflowBundle;
  const fetchJobs = deps.fetchBreezyJobs ?? fetchBreezyJobs;
  const listOnboarding = deps.listAllCandidateOnboardingRecords ?? listAllCandidateOnboardingRecords;

  try {
    const store = await readStore();
    const bundle = await getBundle();
    const jobsResult = await fetchJobs("published");
    const jobs = jobsResult.ok ? jobsResult.jobs : [];
    const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
    const onboardingRecords = await listOnboarding();
    const onboardingByCandidateId = new Map(
      onboardingRecords.map((record) => [record.candidateId, record] as const),
    );

    const all = listIngestedCandidates(store)
      .map((candidate) =>
        buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
          job: jobsByPositionId.get(candidate.positionId),
        }),
      )
      .sort((a, b) => candidateSortKey(a).localeCompare(candidateSortKey(b)));

    const dueFull =
      !input.cursor.lastFullReconciliationAt ||
      nowMs - Date.parse(input.cursor.lastFullReconciliationAt) >=
        input.fullReconciliationIntervalMs ||
      !input.cursor.watermark;

    let startIndex = 0;
    if (!dueFull && input.cursor.continuationToken) {
      const idx = all.findIndex((row) => row.candidateId === input.cursor.continuationToken);
      startIndex = idx >= 0 ? idx + 1 : 0;
    } else if (!dueFull && input.cursor.watermark) {
      startIndex = all.findIndex((row) => candidateSortKey(row) > input.cursor.watermark!);
      if (startIndex < 0) startIndex = 0;
    }

    // Stale cursor recovery: if watermark points past all data, reset.
    if (startIndex >= all.length && all.length > 0 && !dueFull) {
      startIndex = 0;
    }

    const slice = all.slice(startIndex, startIndex + input.maxCandidates);
    const exhausted = startIndex + slice.length >= all.length;
    const last = slice[slice.length - 1];
    const nextCursor: P185CursorState = {
      watermark: last ? candidateSortKey(last) : input.cursor.watermark,
      continuationToken: exhausted ? null : (last?.candidateId ?? null),
      lastFullReconciliationAt: dueFull
        ? new Date(nowMs).toISOString()
        : input.cursor.lastFullReconciliationAt,
      candidatesScannedTotal: input.cursor.candidatesScannedTotal + slice.length,
    };

    return {
      candidates: slice,
      onboardingByCandidateId,
      jobsByPositionId,
      cursor: nextCursor,
      continuationToken: nextCursor.continuationToken,
      exhausted,
      sourceHealthy: jobsResult.ok,
      sourceDetail: jobsResult.ok
        ? `Loaded ${slice.length}/${all.length} candidates (page start ${startIndex}).`
        : `Jobs fetch degraded: ${"error" in jobsResult ? String(jobsResult.error) : "unknown"}; candidates still mapped from ingestion.`,
      scanned: slice.length,
      fullReconciliation: dueFull,
    };
  } catch (err) {
    return {
      candidates: [],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map(),
      cursor: input.cursor,
      continuationToken: input.cursor.continuationToken,
      exhausted: true,
      sourceHealthy: false,
      sourceDetail: err instanceof Error ? err.message : "Candidate source failed.",
      scanned: 0,
      fullReconciliation: false,
    };
  }
}
