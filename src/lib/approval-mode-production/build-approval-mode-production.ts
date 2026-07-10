import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { P84SendQueueEntry, P84SendQueuePreviewReport } from "@/lib/p84-send-queue-preview/types";
import {
  loadP97State,
  p97AuditLogPath,
  p97RollbackPath,
  p97StatePath,
} from "@/lib/approval-mode-production/approval-mode-store";
import type {
  ApprovalModeProductionMetrics,
  ApprovalModeProductionReport,
  ApprovalModeQueueEntry,
  P97PersistedRecord,
} from "@/lib/approval-mode-production/types";
import { P97_LIVE_SEND, P97_SOURCE_PHASE } from "@/lib/approval-mode-production/types";
import type { P62P83ApprovalQueueEntry } from "@/lib/p62-p83-approval-preview/types";

function buildQueueEntryFromPersisted(input: {
  persisted: P97PersistedRecord;
  row: ScoredCandidateWorkflowRow | undefined;
  p84Eligible: boolean | null;
}): ApprovalModeQueueEntry {
  return {
    candidateId: input.persisted.candidateId,
    candidateName: input.persisted.candidateName,
    email: input.row?.email?.trim() || "",
    jobTitle: input.row?.positionName ?? "",
    city: input.row?.city ?? "",
    state: input.row?.state ?? "",
    recruiter: input.persisted.afterState.assignedRecruiter,
    dm: input.persisted.afterState.assignedDM,
    confidence: 0,
    riskLevel: "low",
    status: "persisted",
    approvedBy: input.persisted.approvedBy,
    approvedAt: input.persisted.approvedAt,
    beforeState: input.persisted.beforeState,
    afterState: input.persisted.afterState,
    rollbackAvailable: Boolean(input.persisted.rollbackId),
    p84EligibleAfterPersistence: input.p84Eligible,
    liveSend: false,
    manualApprovalRequired: true,
  };
}

function buildQueueEntry(input: {
  sendEntry: P84SendQueueEntry;
  approvalMeta: P62P83ApprovalQueueEntry | null;
  persisted: P97PersistedRecord | undefined;
  p84Eligible: boolean | null;
}): ApprovalModeQueueEntry {
  return {
    candidateId: input.sendEntry.candidateId,
    candidateName: input.sendEntry.candidateName,
    email: input.sendEntry.email,
    jobTitle: input.sendEntry.jobTitle,
    city: input.sendEntry.city,
    state: input.sendEntry.state,
    recruiter: input.sendEntry.recruiter,
    dm: input.sendEntry.dm,
    confidence: input.approvalMeta?.confidence ?? 0,
    riskLevel: input.approvalMeta?.riskLevel ?? "medium",
    status: input.persisted ? "persisted" : "pending",
    approvedBy: input.persisted?.approvedBy ?? null,
    approvedAt: input.persisted?.approvedAt ?? null,
    beforeState: input.persisted?.beforeState ?? null,
    afterState: input.persisted?.afterState ?? null,
    rollbackAvailable: Boolean(input.persisted?.rollbackId),
    p84EligibleAfterPersistence: input.p84Eligible,
    liveSend: false,
    manualApprovalRequired: true,
  };
}

function buildMetrics(queue: ApprovalModeQueueEntry[]): ApprovalModeProductionMetrics {
  const persisted = queue.filter((q) => q.status === "persisted");
  const pending = queue.filter((q) => q.status === "pending");
  return {
    pendingApprovals: pending.length,
    approved: persisted.length,
    persisted: persisted.length,
    rollbackAvailable: persisted.filter((q) => q.rollbackAvailable).length,
    p84EligibleAfterPersistence: persisted.filter((q) => q.p84EligibleAfterPersistence).length,
    liveSendsBlocked: queue.length,
  };
}

export async function buildApprovalModeProductionReport(input: {
  p96: P84SendQueuePreviewReport;
  p95ApprovalByCandidateId: Map<string, P62P83ApprovalQueueEntry>;
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  mtdRangeLabel: string;
}): Promise<ApprovalModeProductionReport> {
  const state = await loadP97State();
  const persistedById = new Map(state.persisted.map((p) => [p.candidateId, p]));
  const queuedIds = new Set<string>();

  const queue: ApprovalModeQueueEntry[] = [];

  for (const sendEntry of input.p96.sendQueue) {
    queuedIds.add(sendEntry.candidateId);
    const persisted = persistedById.get(sendEntry.candidateId);
    let p84Eligible: boolean | null = null;

    if (persisted) {
      const row = input.rowsByCandidateId.get(sendEntry.candidateId);
      if (row) {
        const p84 = buildPaperworkSendEligibility({
          row,
          onboarding: input.onboardingByCandidateId.get(sendEntry.candidateId) ?? null,
          jobsByPositionId: input.jobsByPositionId,
        });
        p84Eligible = p84.eligible;
      }
    }

    queue.push(
      buildQueueEntry({
        sendEntry,
        approvalMeta: input.p95ApprovalByCandidateId.get(sendEntry.candidateId) ?? null,
        persisted,
        p84Eligible,
      }),
    );
  }

  for (const persisted of state.persisted) {
    if (queuedIds.has(persisted.candidateId)) continue;

    const row = input.rowsByCandidateId.get(persisted.candidateId);
    let p84Eligible: boolean | null = null;
    if (row) {
      const p84 = buildPaperworkSendEligibility({
        row,
        onboarding: input.onboardingByCandidateId.get(persisted.candidateId) ?? null,
        jobsByPositionId: input.jobsByPositionId,
      });
      p84Eligible = p84.eligible;
    }

    queue.push(buildQueueEntryFromPersisted({ persisted, row, p84Eligible }));
  }

  const metrics = buildMetrics(queue);

  return {
    sourcePhase: P97_SOURCE_PHASE,
    previewMode: false,
    liveSend: P97_LIVE_SEND,
    generatedAt: new Date().toISOString(),
    mtdRangeLabel: input.mtdRangeLabel,
    sectionTitle: "Approval Mode Production",
    cohortLabel: "P96 send queue — approval-mode persistence (explicit POST only)",
    metrics,
    queue,
    sampleTraces: queue.filter((q) => q.status === "persisted").slice(0, 5).length
      ? queue.filter((q) => q.status === "persisted").slice(0, 5)
      : queue.slice(0, 5),
    auditLogPath: p97AuditLogPath(),
    rollbackArtifactPath: p97RollbackPath(),
    stateArtifactPath: p97StatePath(),
    remainingBlockersBeforeLivePaperwork: [
      "P97 persists workflow only through explicit POST /api/approval-mode-production",
      `${metrics.pendingApprovals} candidate(s) still pending manual approval`,
      `${metrics.persisted} candidate(s) persisted with rollback snapshots`,
      `${metrics.p84EligibleAfterPersistence} persisted candidate(s) P84-eligible after recheck`,
      "No paperwork sends in P97 — liveSend remains false",
      "No Breezy writes in P97",
      "Executive sign-off still required before enabling P84 liveSend",
      "14 closed Breezy jobs cohort remains outside this queue",
    ],
  };
}

export async function buildApprovalModeProductionFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<ApprovalModeProductionReport> {
  const { buildP84SendQueuePreviewFromStores } = await import("@/lib/p84-send-queue-preview");
  const { buildP62P83ApprovalPreviewFromStores } = await import("@/lib/p62-p83-approval-preview");
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const [p96, p95, store, bundle, jobsResult, onboardingRecords] = await Promise.all([
    buildP84SendQueuePreviewFromStores(input),
    buildP62P83ApprovalPreviewFromStores(input),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  for (const entry of p96.sendQueue) {
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

  const p97State = await loadP97State();
  for (const persisted of p97State.persisted) {
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

  return buildApprovalModeProductionReport({
    p96,
    p95ApprovalByCandidateId: new Map(p95.approvalQueue.map((e) => [e.candidateId, e])),
    rowsByCandidateId,
    jobsByPositionId,
    onboardingByCandidateId: new Map(onboardingRecords.map((r) => [r.candidateId, r])),
    mtdRangeLabel: p96.mtdRangeLabel,
  });
}
