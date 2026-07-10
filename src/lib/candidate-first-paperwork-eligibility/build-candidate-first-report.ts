import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { evaluateCandidateFirstPaperwork } from "@/lib/candidate-first-paperwork-eligibility/evaluate-candidate-first-paperwork";
import type {
  CandidateFirstCountCategory,
  CandidateFirstPaperworkReport,
  CandidateFirstRecommendedAction,
} from "@/lib/candidate-first-paperwork-eligibility/types";
import {
  P151_1_DEFAULT_MAX_SENDS,
  P151_1_SOURCE_PHASE,
} from "@/lib/candidate-first-paperwork-eligibility/types";
import {
  executeInitialPaperworkAutoSend,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";

export function isP151CandidateFirstPaperworkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P151_CANDIDATE_FIRST_PAPERWORK_ENABLED === "true";
}

export function getP151CandidateFirstMaxSends(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P151_CANDIDATE_FIRST_MAX_SENDS_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P151_1_DEFAULT_MAX_SENDS;
}

const COUNT_CATEGORIES: CandidateFirstCountCategory[] = [
  "Send Paperwork",
  "Assign Recruiter",
  "Manual Review",
  "Do Not Send",
  "Already Sent",
  "Duplicate",
  "Invalid Email",
];

const ACTION_CATEGORIES: CandidateFirstRecommendedAction[] = [
  "Send Paperwork",
  "Assign Recruiter",
  "Manual Review",
  "Do Not Send",
];

function emptyCategoryCounts(): Record<CandidateFirstCountCategory, number> {
  return Object.fromEntries(COUNT_CATEGORIES.map((k) => [k, 0])) as Record<
    CandidateFirstCountCategory,
    number
  >;
}

function emptyActionCounts(): Record<CandidateFirstRecommendedAction, number> {
  return Object.fromEntries(ACTION_CATEGORIES.map((k) => [k, 0])) as Record<
    CandidateFirstRecommendedAction,
    number
  >;
}

export async function buildCandidateFirstPaperworkReport(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
}): Promise<CandidateFirstPaperworkReport> {
  const started = Date.now();
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);
  const enabled = isP151CandidateFirstPaperworkEnabled();
  const dryRun = input.dryRun ?? !enabled;
  const liveExecution = enabled && !dryRun;

  const [candidatesResult, jobsResult, workflows, onboardingRecords, auditEvents, onboardingPolicy] =
    await Promise.all([
      resolveCandidatesForRead({ scanMode: "preview" }),
      fetchBreezyJobs("published").catch(() => ({
        ok: false as const,
        error: "Jobs unavailable",
        fetchedAt: generatedAt,
      })),
      getCandidateWorkflowState(),
      listAllCandidateOnboardingRecords().catch(() => []),
      loadPaperworkAutomationAuditLog().catch(() => []),
      loadCandidateOnboardingPolicy().catch(() => null),
    ]);

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(input.session, candidatesResult.candidates)
    : [];
  const publishedJobs = jobsResult.ok ? applyTerritoryToJobs(input.session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const policy = onboardingPolicy ?? DEFAULT_CANDIDATE_ONBOARDING_POLICY;

  const categoryCounts = emptyCategoryCounts();
  const actionCounts = emptyActionCounts();
  const rows = candidates.map((candidate) => {
    const row = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const evaluated = evaluateCandidateFirstPaperwork({
      row,
      candidate,
      jobsByPositionId,
      publishedJobs,
      onboarding: onboardingByCandidate.get(candidate.candidateId) ?? null,
      referenceMs,
    });
    categoryCounts[evaluated.countCategory] += 1;
    actionCounts[evaluated.recommendedAction] += 1;
    return evaluated;
  });

  let sentCount = 0;
  let skippedCount = 0;
  let blockedCount = 0;
  let failedCount = 0;
  let duplicatesPrevented = 0;

  if (liveExecution) {
    const sendEligible = rows.filter((r) => r.sendPaperworkEligible);
    const contexts = sendEligible.map((item) => {
      const candidate = candidates.find((c) => c.candidateId === item.candidateId)!;
      const row = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId ?? ""),
      });
      return {
        row,
        jobsByPositionId,
        onboarding: onboardingByCandidate.get(item.candidateId) ?? null,
        advancement: evaluateCandidate({
          row,
          jobsByPositionId,
          advancementOptions: { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE },
          referenceMs,
        }),
        onboardingPolicy: policy,
        referenceMs,
      };
    });

    const advancements = contexts.map((ctx) => ctx.advancement!);
    const execution = await executeInitialPaperworkAutoSend({
      contexts,
      advancements,
      auditEvents,
      onboardingPolicy: policy,
      dryRun: false,
      autoSendEnabled: true,
      userId: input.userId ?? input.session.userId,
      userEmail: input.session.email,
      referenceMs,
      executionLimits: {
        maxSends: getP151CandidateFirstMaxSends(),
        stopOnFirstError: true,
      },
      candidateFirstMode: true,
    });

    sentCount = execution.sentCount;
    skippedCount = execution.skippedCount;
    blockedCount = execution.blockedCount;
    failedCount = execution.failedCount;
    duplicatesPrevented = execution.duplicatesPrevented;
  } else {
    skippedCount = rows.filter((r) => r.sendPaperworkEligible).length;
  }

  const rollbackRecommendation =
    failedCount > 0
      ? "Set P151_CANDIDATE_FIRST_PAPERWORK_ENABLED=false and review failures."
      : sentCount > 0
        ? "Monitor audit log before raising P151_CANDIDATE_FIRST_MAX_SENDS_PER_CYCLE."
        : "Dry run complete — enable P151_CANDIDATE_FIRST_PAPERWORK_ENABLED only after reviewing candidate-first report.";

  return {
    sourcePhase: P151_1_SOURCE_PHASE,
    generatedAt,
    dryRun: !liveExecution,
    candidateFirstEnabled: liveExecution,
    candidatesEvaluated: rows.length,
    categoryCounts,
    actionCounts,
    sentCount,
    skippedCount,
    blockedCount,
    failedCount,
    duplicatesPrevented,
    executionTimeMs: Date.now() - started,
    safetyFlags: {
      breezyWrites: false,
      executeBatchCalled: false,
      breezyCandidateMovement: false,
      candidateFirstEnabled: liveExecution,
    },
    rollbackRecommendation,
    candidates: rows.sort((a, b) => a.candidateName.localeCompare(b.candidateName)),
  };
}
