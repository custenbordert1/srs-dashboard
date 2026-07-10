import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import {
  loadP97RollbackFile,
  loadP97State,
  p97AuditLogPath,
  p97RollbackPath,
} from "@/lib/approval-mode-production/approval-mode-store";
import type { P97PersistedRecord } from "@/lib/approval-mode-production/types";
import { loadP97AuditCandidateIds } from "@/lib/live-send-readiness/load-audit-candidate-ids";
import { loadLiveSendReadinessApproval } from "@/lib/live-send-readiness/live-send-readiness-store";
import type {
  LiveSendReadinessCandidateEntry,
  LiveSendReadinessGate,
  LiveSendReadinessGateId,
  LiveSendReadinessMetrics,
  LiveSendReadinessReport,
  LiveSendSafetyLock,
} from "@/lib/live-send-readiness/types";
import {
  P99_CONFIRMATION_PHRASE,
  P99_LIVE_SEND,
  P99_SOURCE_PHASE,
} from "@/lib/live-send-readiness/types";

function gate(
  id: LiveSendReadinessGateId,
  label: string,
  passed: boolean,
  detail: string | null = null,
): LiveSendReadinessGate {
  return { id, label, passed, detail };
}

function isDmAssigned(dm: string | null | undefined): boolean {
  const value = dm?.trim() ?? "";
  return value.length > 0 && value !== "Unassigned";
}

function isNotAlreadySent(row: ScoredCandidateWorkflowRow): boolean {
  return row.paperworkStatus !== "sent" && row.paperworkStatus !== "viewed";
}

function buildCandidateReadiness(input: {
  persisted: P97PersistedRecord;
  row: ScoredCandidateWorkflowRow;
  p84Eligible: boolean;
  p84Gates: ReturnType<typeof buildPaperworkSendEligibility>["gates"];
  rollbackIds: Set<string>;
  auditCandidateIds: Set<string>;
}): LiveSendReadinessCandidateEntry {
  const { row, persisted, p84Gates } = input;
  const gates: LiveSendReadinessGate[] = [];

  gates.push(
    gate(
      "p84_eligible",
      "P84 eligible",
      input.p84Eligible,
      input.p84Eligible ? null : "P84 eligibility gates not satisfied.",
    ),
  );

  const emailGate = p84Gates.find((g) => g.id === "valid_email");
  gates.push(
    gate("valid_email", "Valid email", emailGate?.passed ?? false, emailGate?.detail ?? null),
  );

  const duplicateGate = p84Gates.find((g) => g.id === "no_duplicate");
  gates.push(
    gate(
      "no_duplicate",
      "No duplicate paperwork",
      duplicateGate?.passed ?? false,
      duplicateGate?.detail ?? null,
    ),
  );

  const notSent = isNotAlreadySent(row);
  gates.push(
    gate(
      "not_already_sent",
      "Not already sent",
      notSent,
      notSent ? null : `Paperwork status: ${row.paperworkStatus}.`,
    ),
  );

  const signedGate = p84Gates.find((g) => g.id === "not_signed");
  gates.push(
    gate("not_signed", "Not signed", signedGate?.passed ?? false, signedGate?.detail ?? null),
  );

  const rejectedGate = p84Gates.find((g) => g.id === "not_rejected");
  gates.push(
    gate(
      "not_rejected",
      "Not rejected/inactive",
      (rejectedGate?.passed ?? false) &&
        (p84Gates.find((g) => g.id === "not_inactive")?.passed ?? false),
      rejectedGate?.detail ??
        p84Gates.find((g) => g.id === "not_inactive")?.detail ??
        null,
    ),
  );

  const publishedGate = p84Gates.find((g) => g.id === "published_job");
  gates.push(
    gate(
      "published_job",
      "Published job",
      publishedGate?.passed ?? false,
      publishedGate?.detail ?? null,
    ),
  );

  const recruiterAssigned = !isUnassignedRecruiter(row.assignedRecruiter);
  gates.push(
    gate(
      "recruiter_assigned",
      "Recruiter assigned",
      recruiterAssigned,
      recruiterAssigned ? null : "Awaiting recruiter assignment.",
    ),
  );

  const dmAssigned = isDmAssigned(row.assignedDM);
  gates.push(
    gate("dm_assigned", "DM assigned", dmAssigned, dmAssigned ? null : "Awaiting DM assignment."),
  );

  const paperworkNeeded = row.workflowStatus === "Paperwork Needed";
  gates.push(
    gate(
      "workflow_paperwork_needed",
      "Workflow status Paperwork Needed",
      paperworkNeeded,
      paperworkNeeded ? null : `Current status: ${row.workflowStatus}.`,
    ),
  );

  const sendAction = (row.actionType ?? "none") === "send-paperwork";
  gates.push(
    gate(
      "action_send_paperwork",
      "Action type send-paperwork",
      sendAction,
      sendAction ? null : `Current action: ${row.actionType ?? "none"}.`,
    ),
  );

  const rollbackAvailable = Boolean(persisted.rollbackId && input.rollbackIds.has(persisted.rollbackId));
  gates.push(
    gate(
      "rollback_available",
      "Rollback available",
      rollbackAvailable,
      rollbackAvailable ? null : "No rollback snapshot for candidate.",
    ),
  );

  const auditExists = input.auditCandidateIds.has(persisted.candidateId);
  gates.push(
    gate(
      "audit_log_exists",
      "Audit log exists",
      auditExists,
      auditExists ? null : "No P97 approval_persist audit entry.",
    ),
  );

  const blockingReasons = gates.filter((g) => !g.passed).map((g) => g.detail ?? g.label);

  return {
    candidateId: persisted.candidateId,
    candidateName: persisted.candidateName,
    email: row.email?.trim() || "",
    recruiter: row.assignedRecruiter,
    dm: row.assignedDM,
    ready: blockingReasons.length === 0,
    blockingReasons,
    gates,
  };
}

function buildMetrics(candidates: LiveSendReadinessCandidateEntry[]): LiveSendReadinessMetrics {
  const readinessPassCount = candidates.filter((c) => c.ready).length;
  return {
    totalCandidates: candidates.length,
    readinessPassCount,
    readinessBlockedCount: candidates.length - readinessPassCount,
  };
}

function buildSafetyLocks(input: {
  p84Flags: P84FeatureFlags;
  metrics: LiveSendReadinessMetrics;
  rollbackEntryCount: number;
  readinessApproved: boolean;
}): LiveSendSafetyLock[] {
  return [
    {
      id: "live_send_disabled",
      label: "P84 liveSend remains disabled",
      satisfied: !input.p84Flags.liveSend,
      detail: input.p84Flags.liveSend
        ? "liveSend is enabled — live paperwork blocked until disabled for controlled rollout."
        : "liveSend disabled (default). Readiness approval does not enable liveSend.",
    },
    {
      id: "executive_flag_required",
      label: "Explicit executive readiness approval",
      satisfied: input.readinessApproved,
      detail: input.readinessApproved
        ? "Executive readiness approval recorded."
        : "POST /api/live-send-readiness/approve with executiveApprovalFlag required.",
    },
    {
      id: "confirmation_phrase_required",
      label: "Typed confirmation phrase",
      satisfied: input.readinessApproved,
      detail: input.readinessApproved
        ? "Confirmation phrase verified at approval time."
        : `Type "${P99_CONFIRMATION_PHRASE}" to approve readiness.`,
    },
    {
      id: "candidate_count_confirmation_required",
      label: "Candidate count confirmation",
      satisfied: input.readinessApproved,
      detail: input.readinessApproved
        ? "Candidate count confirmed at approval time."
        : `Confirm ready count (${input.metrics.readinessPassCount}) matches report.`,
    },
    {
      id: "dry_run_timestamp_required",
      label: "Dry-run report timestamp",
      satisfied: input.readinessApproved,
      detail: input.readinessApproved
        ? "Dry-run report timestamp confirmed at approval time."
        : "Submit generatedAt from GET report when approving readiness.",
    },
    {
      id: "rollback_artifact_present",
      label: "Rollback artifact present",
      satisfied: input.rollbackEntryCount > 0,
      detail:
        input.rollbackEntryCount > 0
          ? `${input.rollbackEntryCount} rollback snapshot(s) on disk.`
          : "P97 rollback artifact missing.",
    },
  ];
}

export async function buildLiveSendReadinessFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<LiveSendReadinessReport> {
  const { buildApprovalModeProductionFromStores } = await import("@/lib/approval-mode-production");
  const { loadP84FeatureFlags } = await import("@/lib/autonomous-paperwork-send-engine/feature-flags-store");
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const generatedAt = new Date().toISOString();

  const [
    p97Production,
    p97State,
    p97Rollback,
    auditCandidateIds,
    p84Flags,
    approvalFile,
    store,
    bundle,
    jobsResult,
    onboardingRecords,
  ] = await Promise.all([
    buildApprovalModeProductionFromStores(input),
    loadP97State(),
    loadP97RollbackFile(),
    loadP97AuditCandidateIds(),
    loadP84FeatureFlags(),
    loadLiveSendReadinessApproval(),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  for (const entry of p97Production.queue) {
    const positionId = store.candidates[entry.candidateId]?.positionId;
    if (!positionId || jobsByPositionId.has(positionId)) continue;
    jobsByPositionId.set(positionId, {
      jobId: positionId,
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

  const range = currentMtdDateRange();
  const candidates =
    input?.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);

  const rowsByCandidateId = new Map(
    candidates.map((candidate) => [
      candidate.candidateId,
      buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    ]),
  );

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

  const rollbackIds = new Set(p97Rollback.entries.map((e) => e.rollbackId));
  const onboardingByCandidateId = new Map(onboardingRecords.map((r) => [r.candidateId, r]));

  const readinessCandidates: LiveSendReadinessCandidateEntry[] = [];

  for (const persisted of p97State.persisted) {
    const row = rowsByCandidateId.get(persisted.candidateId);
    if (!row) {
      readinessCandidates.push({
        candidateId: persisted.candidateId,
        candidateName: persisted.candidateName,
        email: "",
        recruiter: persisted.afterState.assignedRecruiter,
        dm: persisted.afterState.assignedDM,
        ready: false,
        blockingReasons: ["Candidate row not found in ingestion store."],
        gates: [
          gate("p84_eligible", "P84 eligible", false, "Candidate row not found in ingestion store."),
        ],
      });
      continue;
    }

    const p84 = buildPaperworkSendEligibility({
      row,
      onboarding: onboardingByCandidateId.get(persisted.candidateId) ?? null,
      jobsByPositionId,
    });

    readinessCandidates.push(
      buildCandidateReadiness({
        persisted,
        row,
        p84Eligible: p84.eligible,
        p84Gates: p84.gates,
        rollbackIds,
        auditCandidateIds,
      }),
    );
  }

  const metrics = buildMetrics(readinessCandidates);
  const readinessApproved = Boolean(approvalFile.approval?.approved);
  const dryRunReportTimestamp = p97State.updatedAt || generatedAt;

  return {
    sourcePhase: P99_SOURCE_PHASE,
    generatedAt,
    dryRunReportTimestamp,
    mtdRangeLabel: p97Production.mtdRangeLabel,
    sectionTitle: "Live Send Readiness",
    cohortLabel: "P97 persisted candidates — final gate before enabling live paperwork send",
    metrics,
    candidates: readinessCandidates,
    safetyLocks: buildSafetyLocks({
      p84Flags,
      metrics,
      rollbackEntryCount: p97Rollback.entries.length,
      readinessApproved,
    }),
    requiredConfirmationPhrase: P99_CONFIRMATION_PHRASE,
    liveSend: P99_LIVE_SEND,
    readinessApproved,
    approvalRecord: approvalFile.approval,
    auditLogPath: p97AuditLogPath(),
    rollbackArtifactPath: p97RollbackPath(),
    finalStepBeforeLiveSend:
      "After executive readiness approval: explicitly enable P84 liveSend and run controlled live-send phase. Readiness approval does not send paperwork.",
  };
}
