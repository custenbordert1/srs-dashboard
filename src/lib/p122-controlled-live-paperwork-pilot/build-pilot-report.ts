import type { BreezyJob } from "@/lib/breezy-api";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { loadP100State } from "@/lib/controlled-live-send/controlled-live-send-store";
import { p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import { buildPilotSendPacketPreview } from "@/lib/p122-controlled-live-paperwork-pilot/build-send-packet-preview";
import { buildSystemPilotSafetyChecks, resolvePilotGoNoGo } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-safety-gates";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry, p122PilotRegistryPath } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import {
  P122_CONFIRMATION_PHRASE,
  P122_SOURCE_PHASE,
  type ControlledLivePaperworkPilotReport,
  type PilotCandidateEvaluation,
} from "@/lib/p122-controlled-live-paperwork-pilot/types";

async function loadCandidateContext() {
  const { readIngestionStore } = await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const [store, bundle, jobsResult, closedJobsResult, onboardingRecords, p100State, p109Records, pilotRegistry] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      fetchBreezyJobs("published"),
      fetchBreezyJobs("closed"),
      listAllCandidateOnboardingRecords(),
      loadP100State(),
      loadP109ReviewRecords(),
      loadPilotSendRegistry(),
    ]);

  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const closedJobsByPositionId = new Map(
    (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const publishedJobTitleById = new Map(publishedJobs.map((job) => [job.jobId, job.name]));
  const onboardingByCandidate = new Map(onboardingRecords.map((record) => [record.candidateId, record]));
  const p109ByCandidate = new Map(p109Records.map((record) => [record.candidateId, record]));

  const rowsByCandidateId = new Map(
    Object.values(store.candidates).map((candidate) => [
      candidate.candidateId,
      buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId) as BreezyJob | undefined,
      }),
    ]),
  );

  return {
    jobsByPositionId,
    closedJobsByPositionId,
    publishedJobs,
    publishedJobTitleById,
    onboardingByCandidate,
    p109ByCandidate,
    rowsByCandidateId,
    p100SentIds: new Set(p100State.sentCandidateIds),
    pilotSentIds: new Set(pilotRegistry.sends.map((entry) => entry.candidateId)),
    pilotSendCount: pilotRegistry.sendCount,
    pilotRegistry,
  };
}

function pickTargetCandidate(
  evaluations: PilotCandidateEvaluation[],
  candidateId?: string,
): PilotCandidateEvaluation | null {
  if (candidateId) {
    return evaluations.find((entry) => entry.candidateId === candidateId) ?? null;
  }
  return evaluations.find((entry) => entry.allowlisted && entry.status === "ready_to_send") ?? null;
}

export async function buildControlledLivePaperworkPilotReport(input?: {
  dryRun?: boolean;
  confirmationPhrase?: string;
  candidateId?: string;
  config?: ReturnType<typeof loadPilotConfig>;
}): Promise<ControlledLivePaperworkPilotReport> {
  const dryRun = input?.dryRun !== false;
  const config = input?.config ?? loadPilotConfig();
  const context = await loadCandidateContext();

  const candidateIds = Array.from(
    new Set([
      ...(config.allowlist.length > 0 ? config.allowlist : []),
      ...(input?.candidateId ? [input.candidateId] : []),
    ]),
  );

  const evaluatedCandidates = candidateIds.map((candidateId) => {
    const row = context.rowsByCandidateId.get(candidateId) ?? null;
    const approvedMapping = resolveApprovedMapping({
      record: context.p109ByCandidate.get(candidateId) ?? null,
      candidateId,
      closedPositionId: row?.positionId ?? null,
      publishedJobTitleById: context.publishedJobTitleById,
    });

    return evaluatePilotCandidate({
      candidateId,
      row,
      onboarding: context.onboardingByCandidate.get(candidateId) ?? null,
      jobsByPositionId: context.jobsByPositionId,
      closedJobsByPositionId: context.closedJobsByPositionId,
      publishedJobs: context.publishedJobs,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: context.p100SentIds,
      pilotSentIds: context.pilotSentIds,
      approvedMapping,
      config,
      pilotSendCount: context.pilotSendCount,
    });
  });

  const allowlistedCandidates = evaluatedCandidates.filter((entry) => entry.allowlisted);
  const eligiblePilotCandidates = evaluatedCandidates.filter((entry) => entry.status === "ready_to_send");
  const blockedCandidates = evaluatedCandidates.filter((entry) => entry.status === "blocked");
  const targetCandidate = pickTargetCandidate(evaluatedCandidates, input?.candidateId);

  const systemSafetyChecks = buildSystemPilotSafetyChecks({
    config,
    pilotSendCount: context.pilotSendCount,
    dryRun,
    confirmationPhrase: input?.confirmationPhrase,
  });

  const candidateChecks = targetCandidate?.safetyChecks ?? [];
  const combinedChecks = [...systemSafetyChecks, ...candidateChecks];
  const { goNoGo, reason } = resolvePilotGoNoGo(combinedChecks);

  const warnings = [
    "P122 — controlled live paperwork pilot (executeOne only).",
    "P122 — no executeBatch.",
    "P122 — no Breezy writes.",
    dryRun ? "Preview mode — default sends nothing." : "Live pilot execution requested.",
  ];

  return {
    sourcePhase: P122_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    pilotConfig: config,
    requiredConfirmationPhrase: P122_CONFIRMATION_PHRASE,
    systemSafetyChecks,
    evaluatedCandidates,
    eligiblePilotCandidates,
    blockedCandidates,
    allowlistedCandidates,
    sendPacketPreview: targetCandidate
      ? buildPilotSendPacketPreview({
          candidate: targetCandidate,
          auditDestination: p100AuditLogPath(),
        })
      : null,
    sendResult: context.pilotRegistry.lastSendResult,
    auditRecordPath: p100AuditLogPath(),
    pilotRegistryPath: p122PilotRegistryPath(),
    goNoGo,
    goNoGoReason: reason,
    warnings,
  };
}

export { pickTargetCandidate };
