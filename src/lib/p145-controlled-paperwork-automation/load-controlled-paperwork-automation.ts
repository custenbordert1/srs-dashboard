import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import type { BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
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
import { buildRecruitingLiveSnapshot, type RecruitingLiveSnapshotResult } from "@/lib/recruiting-live-snapshot";
import { evaluateCandidate, type CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";
import {
  buildPaperworkQueue,
  type PaperworkAutomationContext,
} from "@/lib/recruiting/paperwork-automation-engine";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import {
  executeAutoSendPaperworkReminders,
  isP146AutoSendEnabled,
  type AutoSendExecutionSummary,
} from "@/lib/recruiting/paperwork-execution-engine";
import {
  executeInitialPaperworkAutoSend,
  isP147InitialPaperworkAutoSendEnabled,
  type InitialPaperworkExecutionSummary,
} from "@/lib/recruiting/initial-paperwork-execution-engine";

export type PaperworkAutomationBundle = {
  contexts: PaperworkAutomationContext[];
  advancements: CandidateAdvancementEvaluation[];
  queue: ReturnType<typeof buildPaperworkQueue>;
  partialSync: boolean;
  candidatesEvaluated: number;
  auditEvents: Awaited<ReturnType<typeof loadPaperworkAutomationAuditLog>>;
  onboardingPolicy: CandidateOnboardingPolicy;
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
  options?: {
    liveSnapshot?: RecruitingLiveSnapshotResult | null;
  },
): Promise<PaperworkAutomationBundle> {
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);

  const liveSnapshotPromise =
    options?.liveSnapshot !== undefined
      ? Promise.resolve(options.liveSnapshot)
      : buildRecruitingLiveSnapshot().catch(() => null);

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
      liveSnapshotPromise,
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

  const advancements = contexts.map((context) => context.advancement!).filter(Boolean);
  const queue = buildPaperworkQueue(contexts);
  const resolvedPolicy = onboardingPolicy ?? DEFAULT_CANDIDATE_ONBOARDING_POLICY;

  return {
    contexts,
    advancements,
    queue,
    partialSync,
    candidatesEvaluated: candidates.length,
    auditEvents,
    onboardingPolicy: resolvedPolicy,
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
    lastInitialPaperworkSummary?: InitialPaperworkExecutionSummary | null;
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
    advancements: bundle.advancements,
    lastAutoSendSummary: options?.lastAutoSendSummary ?? null,
    lastInitialPaperworkSummary: options?.lastInitialPaperworkSummary ?? null,
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
  | "auto_send_reminders"
  | "auto_send_initial";

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
    advancements: bundle.advancements,
    lastAutoSendSummary: summary,
    lastInitialPaperworkSummary: null,
    referenceMs: Date.parse(bundle.meta.refreshedAt),
  });

  return { summary, snapshot };
}

export async function runInitialPaperworkAutoSend(input: {
  session: AuthSession;
  dryRun: boolean;
}): Promise<{
  summary: InitialPaperworkExecutionSummary;
  snapshot: ControlledPaperworkAutomationSnapshot;
}> {
  const bundle = await buildPaperworkAutomationBundle(input.session);
  const summary = await executeInitialPaperworkAutoSend({
    contexts: bundle.contexts,
    advancements: bundle.advancements,
    auditEvents: bundle.auditEvents,
    onboardingPolicy: bundle.onboardingPolicy,
    dryRun: input.dryRun,
    autoSendEnabled: isP147InitialPaperworkAutoSendEnabled(),
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
    advancements: bundle.advancements,
    lastAutoSendSummary: null,
    lastInitialPaperworkSummary: summary,
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
    lastInitialPaperworkSummary: input.snapshot.lastInitialPaperworkSummary,
  });
}
