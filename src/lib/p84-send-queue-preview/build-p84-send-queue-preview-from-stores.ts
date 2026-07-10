import type { BreezyJob } from "@/lib/breezy-api";
import type { P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { P62P83ApprovalQueueEntry } from "@/lib/p62-p83-approval-preview/types";
import { loadP97State } from "@/lib/approval-mode-production/approval-mode-store";
import {
  buildMetricsFromEntries,
  buildP84SendQueueEntry,
  buildP84SendQueueEntryFromPersistedWorkflow,
} from "@/lib/p84-send-queue-preview/build-p84-send-queue-preview";
import type {
  P84SendQueueEntry,
  P84SendQueuePreviewReport,
} from "@/lib/p84-send-queue-preview/types";
import { P96_PREVIEW_MODE, P96_SOURCE_PHASE } from "@/lib/p84-send-queue-preview/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

function buildFinalChecklist(metrics: P84SendQueuePreviewReport["metrics"]): string[] {
  return [
    "P96 dry run complete — no workflow persistence and no Dropbox Sign calls",
    `${metrics.approvalPersistedSimulationCount} candidate(s) had P62/DM/P83 approval persistence simulated`,
    `${metrics.sendQueueCount} candidate(s) in P84 send queue preview (passed P84 gates)`,
    `${metrics.blockedFromSendCount} candidate(s) blocked from send queue`,
    `${metrics.duplicateRiskCount} candidate(s) with duplicate-send protection risk`,
    `${metrics.invalidEmailCount} candidate(s) with missing/invalid email`,
    `${metrics.liveSendsDisabledCount} candidate(s) have liveSend forced false`,
    "Executive approval required for every send — autoApproveBlocked on all entries",
    "P84 liveSend must remain disabled until explicit executive sign-off",
    "14 closed Breezy jobs cohort still outside this send queue",
    "Kerri Haynes (call-first) excluded in P95 — not in this queue",
    "After executive sign-off: enable approval-mode production with liveSend still off first",
  ];
}

export function buildP84SendQueuePreview(input: {
  approvalQueue: P62P83ApprovalQueueEntry[];
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  p84Flags: P84FeatureFlags;
  mtdRangeLabel?: string;
  generatedAt?: string;
}): P84SendQueuePreviewReport {
  const entries: P84SendQueueEntry[] = [];

  for (const approval of input.approvalQueue) {
    const row = input.rowsByCandidateId.get(approval.candidateId);
    if (!row) continue;

    entries.push(
      buildP84SendQueueEntry({
        approval,
        row,
        jobsByPositionId: input.jobsByPositionId,
        onboarding: input.onboardingByCandidateId.get(approval.candidateId) ?? null,
        p84Flags: { ...input.p84Flags, liveSend: false },
      }),
    );
  }

  const metrics = buildMetricsFromEntries(entries);
  const sendQueue = entries.filter((e) => e.inSendQueue);
  const blocked = entries.filter((e) => !e.inSendQueue);

  return {
    sourcePhase: P96_SOURCE_PHASE,
    previewMode: P96_PREVIEW_MODE,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    sectionTitle: "P84 Send Queue Preview",
    cohortLabel: "P95 approval queue — 27 safe candidates after simulated persistence dry run",
    metrics,
    sendQueue,
    blocked,
    sampleTraces: sendQueue.slice(0, 5),
    finalChecklistBeforeApprovalModeProduction: buildFinalChecklist(metrics),
  };
}

export async function buildP84SendQueuePreviewFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<P84SendQueuePreviewReport> {
  const { buildP62P83ApprovalPreviewFromStores } = await import("@/lib/p62-p83-approval-preview");
  const { loadP84FeatureFlags } = await import("@/lib/autonomous-paperwork-send-engine/feature-flags-store");
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const [p95, store, bundle, jobsResult, onboardingRecords, p84Flags] = await Promise.all([
    buildP62P83ApprovalPreviewFromStores(input),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
    loadP84FeatureFlags(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  for (const entry of p95.approvalQueue) {
    if (!jobsByPositionId.has(entry.positionId)) {
      jobsByPositionId.set(entry.positionId, {
        jobId: entry.positionId,
        name: entry.jobTitle,
        city: entry.city,
        state: entry.state,
        zip: "",
        displayLocation: `${entry.city}, ${entry.state}`.replace(/^, |, $/g, ""),
        locationSource: "missing",
        status: "published",
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
  const onboardingByCandidateId = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const p84FlagsSafe = { ...p84Flags, liveSend: false };

  const state = await loadP97State();
  for (const persisted of state.persisted) {
    const row = rowsByCandidateId.get(persisted.candidateId);
    if (!row?.positionId || jobsByPositionId.has(row.positionId)) continue;
    jobsByPositionId.set(row.positionId, {
      jobId: row.positionId,
      name: row.positionName ?? "",
      city: row.city,
      state: row.state,
      zip: row.zipCode ?? "",
      displayLocation: `${row.city}, ${row.state}`.replace(/^, |, $/g, ""),
      locationSource: "missing",
      status: "published",
      createdDate: "",
      updatedDate: "",
    });
  }

  const preview = buildP84SendQueuePreview({
    approvalQueue: p95.approvalQueue,
    rowsByCandidateId,
    jobsByPositionId,
    onboardingByCandidateId,
    p84Flags: p84FlagsSafe,
    mtdRangeLabel: p95.mtdRangeLabel,
  });

  const coveredIds = new Set(
    [...preview.sendQueue, ...preview.blocked].map((entry) => entry.candidateId),
  );
  const persistedEntries: P84SendQueueEntry[] = [];

  for (const persisted of state.persisted) {
    if (coveredIds.has(persisted.candidateId)) continue;
    const row = rowsByCandidateId.get(persisted.candidateId);
    if (!row) continue;
    persistedEntries.push(
      buildP84SendQueueEntryFromPersistedWorkflow({
        row,
        jobsByPositionId,
        onboarding: onboardingByCandidateId.get(persisted.candidateId) ?? null,
        p84Flags: p84FlagsSafe,
        approvedBy: persisted.approvedBy,
      }),
    );
  }

  if (!persistedEntries.length) {
    return preview;
  }

  const allEntries = [...preview.sendQueue, ...preview.blocked, ...persistedEntries];
  const metrics = buildMetricsFromEntries(allEntries);
  const sendQueue = allEntries.filter((e) => e.inSendQueue);
  const blocked = allEntries.filter((e) => !e.inSendQueue);

  return {
    ...preview,
    cohortLabel:
      "P95 approval queue + P97 persisted candidates — post-approval P84 send queue preview",
    metrics,
    sendQueue,
    blocked,
    sampleTraces: sendQueue.slice(0, 5),
    finalChecklistBeforeApprovalModeProduction: buildFinalChecklist(metrics),
  };
}
