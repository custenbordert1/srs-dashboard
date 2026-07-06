import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import type { BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildControlledPaperworkAutomationSnapshot } from "@/lib/p145-controlled-paperwork-automation/build-controlled-paperwork-automation-snapshot";
import {
  appendPaperworkAutomationAuditEvent,
  loadPaperworkAutomationAuditLog,
} from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import type {
  ControlledPaperworkAutomationSnapshot,
  P145ExecutionMode,
} from "@/lib/p145-controlled-paperwork-automation/types";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import {
  buildPaperworkQueue,
  type PaperworkAutomationContext,
} from "@/lib/recruiting/paperwork-automation-engine";
import {
  executeAutoSendPaperworkReminders,
  isP146AutoSendEnabled,
  type AutoSendExecutionSummary,
} from "@/lib/recruiting/paperwork-execution-engine";

export type PaperworkAutomationBundle = {
  contexts: PaperworkAutomationContext[];
  queue: ReturnType<typeof buildPaperworkQueue>;
  partialSync: boolean;
  candidatesEvaluated: number;
  auditEvents: Awaited<ReturnType<typeof loadPaperworkAutomationAuditLog>>;
  meta: {
    candidatesFromIngestionStore: boolean;
    candidateSource: string | null;
    jobsCount: number;
    refreshedAt: string;
  };
};

export type ControlledPaperworkAutomationLoadResult =
  | {
      ok: true;
      snapshot: ControlledPaperworkAutomationSnapshot;
      partialSync: boolean;
      meta: PaperworkAutomationBundle["meta"];
    }
  | {
      ok: false;
      error: string;
      partial?: boolean;
      snapshot?: ControlledPaperworkAutomationSnapshot;
    };

function jobsMap(jobs: BreezyJob[]): Map<string, BreezyJob> {
  return new Map(jobs.map((job) => [job.jobId, job]));
}

export async function buildPaperworkAutomationBundle(
  session: AuthSession,
): Promise<PaperworkAutomationBundle> {
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);

  const [workflows, candidatesResult, jobsResult, onboardingPolicy, liveSnapshot, onboardingRecords, auditEvents] =
    await Promise.all([
      getCandidateWorkflowState(),
      resolveCandidatesForRead({ scanMode: "preview" }),
      fetchBreezyJobs("published").catch(() => ({
        ok: false as const,
        error: "Jobs unavailable",
        fetchedAt: generatedAt,
      })),
      loadCandidateOnboardingPolicy().catch(() => null),
      buildRecruitingLiveSnapshot().catch(() => null),
      listAllCandidateOnboardingRecords().catch(() => []),
      loadPaperworkAutomationAuditLog().catch(() => []),
    ]);

  const partialSync =
    !candidatesResult.ok ||
    Boolean(candidatesResult.ok && candidatesResult.truncated) ||
    !jobsResult.ok;

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(session, candidatesResult.candidates)
    : [];
  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const jobsByPositionId = jobsMap(jobs);
  const paperworkByGrade = onboardingPolicy?.paperworkByGrade ?? DEFAULT_PAPERWORK_BY_GRADE;
  const onboardingByCandidate = new Map(
    onboardingRecords.map((record) => [record.candidateId, record]),
  );

  const contexts = candidates.map((candidate) => {
    const row = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const advancement = evaluateCandidate({
      row,
      jobsByPositionId,
      advancementOptions: { jobsByPositionId, paperworkByGrade, requireApproval: true },
      coveragePressure: row.isTopMatch ? 80 : 55,
      projectPriority: row.matchPercent,
    });
    return {
      row,
      jobsByPositionId,
      onboarding: onboardingByCandidate.get(candidate.candidateId) ?? null,
      advancement,
      onboardingPolicy: onboardingPolicy ?? undefined,
      referenceMs,
    };
  });

  const queue = buildPaperworkQueue(contexts);

  return {
    contexts,
    queue,
    partialSync,
    candidatesEvaluated: candidates.length,
    auditEvents,
    meta: {
      candidatesFromIngestionStore: candidatesResult.ok ? candidatesResult.fromIngestionStore : false,
      candidateSource: liveSnapshot?.ok ? liveSnapshot.candidateSource : null,
      jobsCount: jobs.length,
      refreshedAt: generatedAt,
    },
  };
}

export async function loadControlledPaperworkAutomationForSession(
  session: AuthSession,
  options?: {
    executionMode?: P145ExecutionMode;
    lastAutoSendSummary?: AutoSendExecutionSummary | null;
  },
): Promise<ControlledPaperworkAutomationLoadResult> {
  const bundle = await buildPaperworkAutomationBundle(session);

  const snapshot = buildControlledPaperworkAutomationSnapshot({
    queue: bundle.queue,
    generatedAt: bundle.meta.refreshedAt,
    partialSync: bundle.partialSync,
    candidatesEvaluated: bundle.candidatesEvaluated,
    recentAuditEvents: bundle.auditEvents,
    executionMode: options?.executionMode ?? "preview",
    contexts: bundle.contexts,
    lastAutoSendSummary: options?.lastAutoSendSummary ?? null,
    referenceMs: Date.parse(bundle.meta.refreshedAt),
  });

  if (!bundle.candidatesEvaluated && bundle.partialSync) {
    return {
      ok: false,
      error: "Candidates unavailable",
      partial: true,
      snapshot,
    };
  }

  return {
    ok: true,
    snapshot,
    partialSync: bundle.partialSync,
    meta: bundle.meta,
  };
}

export type PaperworkApprovalAction =
  | "approve"
  | "reject"
  | "approve_selected"
  | "approve_all"
  | "auto_send_reminders";

export async function runAutoSendPaperworkReminders(input: {
  session: AuthSession;
  dryRun: boolean;
}): Promise<{
  summary: AutoSendExecutionSummary;
  snapshot: ControlledPaperworkAutomationSnapshot;
}> {
  const bundle = await buildPaperworkAutomationBundle(input.session);
  const summary = await executeAutoSendPaperworkReminders({
    contexts: bundle.contexts,
    auditEvents: bundle.auditEvents,
    dryRun: input.dryRun,
    autoSendEnabled: isP146AutoSendEnabled(),
    userId: input.session.userId,
    userEmail: input.session.email,
    referenceMs: Date.parse(bundle.meta.refreshedAt),
  });

  const auditEvents = await loadPaperworkAutomationAuditLog();
  const snapshot = buildControlledPaperworkAutomationSnapshot({
    queue: bundle.queue,
    generatedAt: new Date().toISOString(),
    partialSync: bundle.partialSync,
    candidatesEvaluated: bundle.candidatesEvaluated,
    recentAuditEvents: auditEvents,
    executionMode: "approval",
    contexts: bundle.contexts,
    lastAutoSendSummary: summary,
    referenceMs: Date.parse(bundle.meta.refreshedAt),
  });

  return { summary, snapshot };
}

export async function recordPaperworkApprovals(input: {
  session: AuthSession;
  action: PaperworkApprovalAction;
  candidateIds: string[];
  snapshot: ControlledPaperworkAutomationSnapshot;
}): Promise<ControlledPaperworkAutomationSnapshot> {
  const queueById = new Map(input.snapshot.queue.map((item) => [item.candidateId, item]));
  let targetIds = input.candidateIds;

  if (input.action === "approve_all") {
    targetIds = input.snapshot.approvalQueue
      .filter((row) => row.approveEnabled)
      .map((row) => row.candidateId);
  } else if (input.action === "approve_selected") {
    targetIds = input.candidateIds;
  }

  const isApprove =
    input.action === "approve" ||
    input.action === "approve_selected" ||
    input.action === "approve_all";
  const eventType = isApprove ? "approval_given" : "approval_rejected";

  for (const candidateId of targetIds) {
    const item = queueById.get(candidateId);
    if (!item) continue;
    await appendPaperworkAutomationAuditEvent({
      type: eventType,
      userId: input.session.userId,
      userEmail: input.session.email,
      candidateId,
      project: item.project,
      recommendedAction: item.recommendedAction,
      reason: item.reason,
      executed: false,
      simulated: !input.snapshot.executionEnabled,
    });
  }

  const auditEvents = await loadPaperworkAutomationAuditLog();
  return buildControlledPaperworkAutomationSnapshot({
    queue: input.snapshot.queue,
    generatedAt: new Date().toISOString(),
    partialSync: input.snapshot.partialSync,
    candidatesEvaluated: input.snapshot.candidatesEvaluated,
    recentAuditEvents: auditEvents,
    executionMode: input.snapshot.executionMode,
    lastAutoSendSummary: input.snapshot.lastAutoSendSummary,
  });
}
