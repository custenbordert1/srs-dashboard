import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { sendPaperworkPacket } from "@/lib/candidate-onboarding-engine/send-paperwork-packet";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { appendPaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import {
  detectLegacyPaperworkBlockers,
  P152_BYPASSED_RULES,
} from "@/lib/p152-immediate-paperwork-policy/detect-legacy-paperwork-blockers";
import type {
  ImmediatePaperworkCandidateRow,
  ImmediatePaperworkExecutionItem,
  ImmediatePaperworkPolicyReport,
} from "@/lib/p152-immediate-paperwork-policy/types";
import {
  P152_DEFAULT_MAX_SENDS,
  P152_SOURCE_PHASE,
} from "@/lib/p152-immediate-paperwork-policy/types";
import {
  isOnboardingTemplateKey,
  type OnboardingTemplateKey,
} from "@/lib/onboarding-template-registry";

export function isP152ImmediatePaperworkEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P152_IMMEDIATE_PAPERWORK_ENABLED === "true";
}

export function getP152MaxSendsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P152_MAX_SENDS_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P152_DEFAULT_MAX_SENDS;
}

function resolveTemplateKey(row: { paperworkTemplateKey?: string | null }): OnboardingTemplateKey {
  const fromRow = row.paperworkTemplateKey;
  if (fromRow && isOnboardingTemplateKey(fromRow)) return fromRow;
  return "onboarding_packet";
}

function buildAutonomousPolicy(policy: CandidateOnboardingPolicy): CandidateOnboardingPolicy {
  return {
    ...policy,
    mode: "automatic",
    dryRun: false,
    send: {
      ...policy.send,
      enabled: true,
      requireApproval: false,
    },
  };
}

function buildRollbackRecommendation(report: ImmediatePaperworkPolicyReport): string {
  if (report.failedCount > 0 || report.stoppedOnError) {
    return "Set P152_IMMEDIATE_PAPERWORK_ENABLED=false and review execution failures.";
  }
  if (report.sentCount > 0 && report.capReached) {
    return "Cap reached as designed. Monitor audit log before raising P152_MAX_SENDS_PER_CYCLE.";
  }
  if (report.sentCount > 0) {
    return "Monitor audit log and signature status for 24h before increasing send cap.";
  }
  if (report.eligibleCount === 0) {
    return "No eligible candidates under immediate paperwork policy.";
  }
  return "Dry run complete — enable P152_IMMEDIATE_PAPERWORK_ENABLED only after executive review.";
}

function evaluateCandidateRow(input: {
  candidate: BreezyCandidate;
  workflow: CandidateWorkflowRecord | undefined;
  jobsByPositionId: Map<string, import("@/lib/breezy-api").BreezyJob>;
  onboarding: import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord | null;
  auditEvents: Awaited<ReturnType<typeof loadPaperworkAutomationAuditLog>>;
  referenceMs: number;
}): ImmediatePaperworkCandidateRow {
  const { candidate, workflow, jobsByPositionId, onboarding, auditEvents, referenceMs } = input;
  const row = buildScoredWorkflowRow(candidate, workflow, {
    job: jobsByPositionId.get(candidate.positionId ?? ""),
  });
  const hard = detectImmediatePaperworkHardBlockers({
    row,
    candidate,
    onboarding,
    auditEvents,
  });
  const legacy = hard.blocked
    ? { labels: [], codes: [] as import("@/lib/p152-immediate-paperwork-policy/types").LegacyPaperworkBlocker[] }
    : detectLegacyPaperworkBlockers({
        row,
        jobsByPositionId,
        onboarding,
        auditEvents,
        referenceMs,
      });

  const candidateName =
    `${row.firstName ?? candidate.firstName ?? ""} ${row.lastName ?? candidate.lastName ?? ""}`.trim() ||
    candidate.candidateId;

  return {
    candidateId: row.candidateId,
    candidateName,
    email: row.email?.trim() || candidate.email?.trim() || null,
    recruiter: row.assignedRecruiter,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    eligible: !hard.blocked,
    hardBlockers: hard.blockers,
    primaryHardBlocker: hard.primaryHardBlocker,
    legacyBlockersBypassed: legacy.labels,
    projectedSend: !hard.blocked,
  };
}

export async function executeImmediatePaperworkPolicy(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
  userEmail?: string;
}): Promise<ImmediatePaperworkPolicyReport> {
  const started = Date.now();
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);
  const p152Enabled = isP152ImmediatePaperworkEnabled();
  const dryRun = input.dryRun ?? !p152Enabled;
  const liveExecution = p152Enabled && !dryRun;
  const maxSendsLimit = getP152MaxSendsPerCycle();

  const [candidatesResult, jobsResult, bundle, onboardingRecords, onboardingPolicy, auditEvents] =
    await Promise.all([
      resolveCandidatesForRead({ scanMode: "preview" }),
      fetchBreezyJobs("published").catch(() => ({
        ok: false as const,
        error: "Jobs unavailable",
        fetchedAt: generatedAt,
      })),
      getCandidateWorkflowBundle(),
      listAllCandidateOnboardingRecords().catch(() => []),
      loadCandidateOnboardingPolicy().catch(() => null),
      loadPaperworkAutomationAuditLog().catch(() => []),
    ]);

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(input.session, candidatesResult.candidates)
    : [];
  const jobs = jobsResult.ok ? applyTerritoryToJobs(input.session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));

  const candidateRows = candidates
    .map((candidate) =>
      evaluateCandidateRow({
        candidate,
        workflow: bundle.workflows[candidate.candidateId],
        jobsByPositionId,
        onboarding: onboardingByCandidate.get(candidate.candidateId) ?? null,
        auditEvents,
        referenceMs,
      }),
    )
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.candidateName.localeCompare(b.candidateName);
    });

  const exclusionSummary: Record<string, number> = {};
  const legacyBypassSummary: Record<string, number> = {};
  for (const row of candidateRows) {
    if (!row.eligible) {
      const key = row.primaryHardBlocker ?? row.hardBlockers[0] ?? "unknown";
      exclusionSummary[key] = (exclusionSummary[key] ?? 0) + 1;
    } else {
      for (const label of row.legacyBlockersBypassed) {
        legacyBypassSummary[label] = (legacyBypassSummary[label] ?? 0) + 1;
      }
    }
  }

  const eligibleRows = candidateRows.filter((row) => row.eligible);
  const projectedSendCount = Math.min(eligibleRows.length, maxSendsLimit);

  const executionItems: ImmediatePaperworkExecutionItem[] = [];
  let sentCount = 0;
  let blockedCount = candidateRows.length - eligibleRows.length;
  let failedCount = 0;
  let skippedCount = 0;
  let duplicatesPrevented = 0;
  let capReached = false;
  let stoppedOnError = false;
  let paperworkSent = false;
  let audit = [...auditEvents];

  const policy =
    onboardingPolicy ??
    ({
      mode: "automatic",
      dryRun: false,
      send: { enabled: true, requireApproval: false },
      escalation: { enabled: false, requireApproval: false },
      paperworkByGrade: {},
    } as CandidateOnboardingPolicy);

  for (const item of eligibleRows) {
    if (stoppedOnError) break;
    if (liveExecution && sentCount >= maxSendsLimit) {
      capReached = true;
      break;
    }

    const candidate = candidates.find((c) => c.candidateId === item.candidateId);
    if (!candidate) continue;
    const row = buildScoredWorkflowRow(candidate, bundle.workflows[item.candidateId], {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const templateKey = resolveTemplateKey(row);
    const executionMode: "dry_run" | "live" = liveExecution ? "live" : "dry_run";

    let sendResult: "sent" | "skipped" | "failed" = "skipped";
    let reason = liveExecution ? "" : "Dry run — immediate paperwork not sent.";
    let signatureRequestId: string | null = null;

    if (!liveExecution) {
      skippedCount += 1;
      sendResult = "skipped";
    } else {
      const packet = await sendPaperworkPacket({
        row,
        policy: buildAutonomousPolicy(policy),
        byUserId: input.userId ?? input.session.userId,
        dryRun: false,
      });
      if (packet.ok && packet.sent) {
        sendResult = "sent";
        sentCount += 1;
        paperworkSent = true;
        signatureRequestId = packet.record.signatureRequestId ?? null;
        reason = `Immediate paperwork sent — ${signatureRequestId ?? "queued"}.`;
      } else if (packet.ok && !packet.sent) {
        sendResult = "skipped";
        skippedCount += 1;
        reason = "Packet prepared but not sent (policy gate).";
      } else {
        sendResult = "failed";
        failedCount += 1;
        reason = !packet.ok ? packet.error : "Send failed.";
        stoppedOnError = true;
      }
    }

    executionItems.push({
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      email: item.email ?? "",
      recruiter: item.recruiter,
      project: row.positionName || "—",
      sendResult,
      reason,
      executionMode,
      signatureRequestId,
    });

    audit = await appendPaperworkAutomationAuditEvent({
      type: sendResult === "sent" ? "initial_paperwork_sent" : "paperwork_sent",
      userId: input.userId ?? input.session.userId,
      userEmail: input.userEmail ?? input.session.email,
      candidateId: item.candidateId,
      project: row.positionName || "—",
      recommendedAction: "Send Initial Paperwork",
      reason: `[P152] ${reason}`,
      executed: sendResult === "sent",
      simulated: !liveExecution || sendResult !== "sent",
      candidateName: item.candidateName,
      email: item.email ?? "",
      recruiter: item.recruiter,
      autoSendEligible: true,
      sendResult,
      blockedReason: null,
      paperworkStatusBeforeSend: row.paperworkStatus,
      templateUsed: templateKey,
      executionMode,
      jobId: row.positionId ?? undefined,
      validationResult: { passed: true, reasons: [] },
      duplicatePrevented: false,
    });
  }

  const report: ImmediatePaperworkPolicyReport = {
    sourcePhase: P152_SOURCE_PHASE,
    generatedAt,
    dryRun: !liveExecution,
    immediatePaperworkEnabled: liveExecution,
    candidatesEvaluated: candidateRows.length,
    eligibleCount: eligibleRows.length,
    excludedCount: candidateRows.length - eligibleRows.length,
    projectedSendCount,
    sentCount,
    blockedCount,
    failedCount,
    skippedCount,
    duplicatesPrevented,
    exclusionSummary,
    legacyBypassSummary,
    bypassedRules: [...P152_BYPASSED_RULES],
    candidates: candidateRows,
    executionItems,
    executionTimeMs: Date.now() - started,
    maxSendsLimit,
    capReached,
    stoppedOnError,
    sentCandidateIds: executionItems
      .filter((item) => item.sendResult === "sent")
      .map((item) => item.candidateId),
    safetyFlags: {
      breezyWrites: false,
      executeBatchCalled: false,
      paperworkSent,
    },
    rollbackRecommendation: "",
  };
  report.rollbackRecommendation = buildRollbackRecommendation(report);
  return report;
}
