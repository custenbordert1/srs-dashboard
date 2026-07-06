import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { sendPaperworkPacket } from "@/lib/candidate-onboarding-engine/send-paperwork-packet";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import { appendPaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import type { CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";
import type {
  PaperworkAutomationContext,
  PaperworkQueueItem,
} from "@/lib/recruiting/paperwork-automation-engine";
import {
  buildPaperworkQueue,
  evaluatePaperworkCandidate,
} from "@/lib/recruiting/paperwork-automation-engine";
import {
  isOnboardingTemplateKey,
  type OnboardingTemplateKey,
} from "@/lib/onboarding-template-registry";

export const P147_INITIAL_CONFIDENCE_MIN = 90;
export const P147_SOURCE_PHASE = "P147";

const HIRED_STATUSES = new Set(["Active Rep", "Loaded in MEL", "Ready for MEL", "Signed"]);

export type InitialPaperworkSendResult = "sent" | "skipped" | "blocked" | "failed" | "duplicatePrevented";

export type InitialPaperworkValidationResult = {
  passed: boolean;
  reasons: string[];
};

export type InitialPaperworkEligibility = {
  eligible: boolean;
  blockedReason: string | null;
  duplicatePrevented: boolean;
  validation: InitialPaperworkValidationResult;
};

export type InitialPaperworkExecutionItem = {
  candidateId: string;
  candidateName: string;
  email: string;
  project: string;
  jobId: string | null;
  recruiter: string;
  paperworkTemplate: string;
  recommendedAction: string;
  advancementConfidence: number;
  sendResult: InitialPaperworkSendResult;
  reason: string;
  blockedReason: string | null;
  duplicatePrevented: boolean;
  validationResult: InitialPaperworkValidationResult;
  paperworkStatusBeforeSend: string;
  executionMode: "dry_run" | "live";
  signatureRequestId: string | null;
};

export type InitialPaperworkExecutionSummary = {
  sourcePhase: typeof P147_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  autoSendEnabled: boolean;
  eligibleCount: number;
  sentCount: number;
  blockedCount: number;
  failedCount: number;
  skippedCount: number;
  duplicatesPrevented: number;
  executionTimeMs: number;
  items: InitialPaperworkExecutionItem[];
  executeBatchCalled: false;
  breezyWrites: false;
  paperworkSent: boolean;
};

export function isP147InitialPaperworkAutoSendEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.P147_INITIAL_PAPERWORK_AUTO_SEND_ENABLED === "true";
}

function resolveTemplateKey(row: ScoredCandidateWorkflowRow): OnboardingTemplateKey {
  const fromRow = row.paperworkTemplateKey;
  if (fromRow && isOnboardingTemplateKey(fromRow)) return fromRow;
  return "onboarding_packet";
}

function hasInitialPaperworkAuditSend(
  auditEvents: PaperworkAutomationAuditEvent[],
  candidateId: string,
): boolean {
  return auditEvents.some(
    (event) =>
      event.candidateId === candidateId &&
      event.sendResult === "sent" &&
      (event.recommendedAction === "Send Initial Paperwork" ||
        event.type === "paperwork_sent" ||
        event.type === "initial_paperwork_sent"),
  );
}

export function evaluateInitialPaperworkEligibility(input: {
  context: PaperworkAutomationContext;
  advancement: CandidateAdvancementEvaluation;
  auditEvents: PaperworkAutomationAuditEvent[];
  referenceMs?: number;
}): InitialPaperworkEligibility {
  const { context, advancement, auditEvents } = input;
  const referenceMs = input.referenceMs ?? Date.now();
  const reasons: string[] = [];
  const row = context.row;
  const job = row.positionId ? context.jobsByPositionId.get(row.positionId) : undefined;

  if (advancement.nextAction !== "Send Paperwork") {
    reasons.push(`P144 next action is "${advancement.nextAction}", not Send Paperwork.`);
  }
  if (advancement.confidence < P147_INITIAL_CONFIDENCE_MIN) {
    reasons.push(`Confidence ${advancement.confidence}% below ${P147_INITIAL_CONFIDENCE_MIN}% threshold.`);
  }
  if (advancement.blockers.length > 0) {
    reasons.push(`P144 blockers: ${advancement.blockers.join(", ")}.`);
  }

  const freshItem = evaluatePaperworkCandidate({ ...context, referenceMs });
  if (!freshItem || freshItem.recommendedAction !== "Send Initial Paperwork") {
    reasons.push("Paperwork queue does not recommend Send Initial Paperwork.");
  } else if (freshItem.blockers.length > 0) {
    reasons.push(`Paperwork blockers: ${freshItem.blockers.join(", ")}.`);
  }

  if (HIRED_STATUSES.has(row.workflowStatus) || row.paperworkStatus === "signed") {
    reasons.push("Candidate already hired or paperwork signed.");
  }
  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    reasons.push("Recruiter not assigned.");
  }
  if (!row.email?.trim()) {
    reasons.push("Missing valid email.");
  }
  if (!row.positionId?.trim() || !job) {
    reasons.push("No open published position.");
  }
  if (job && job.status !== "published") {
    reasons.push("Position is not published.");
  }

  const duplicateReason = duplicatePaperworkSendBlockReason({
    activeOnboarding: context.onboarding ?? undefined,
  });
  if (duplicateReason) {
    reasons.push(duplicateReason);
  }
  if (row.signatureRequestId || row.paperworkStatus === "sent" || row.paperworkStatus === "viewed") {
    reasons.push("Paperwork already sent.");
  }

  const eligibility = buildPaperworkSendEligibility({
    row,
    onboarding: context.onboarding,
    jobsByPositionId: context.jobsByPositionId,
  });
  if (!eligibility.eligible) {
    reasons.push(...eligibility.blockingReasons);
  }

  const duplicatePrevented =
    hasInitialPaperworkAuditSend(auditEvents, row.candidateId) || duplicateReason != null;
  if (hasInitialPaperworkAuditSend(auditEvents, row.candidateId)) {
    reasons.push("Initial paperwork already recorded in audit log — duplicate prevented.");
  }

  const validation: InitialPaperworkValidationResult = {
    passed: reasons.length === 0,
    reasons,
  };

  return {
    eligible: validation.passed,
    blockedReason: validation.passed ? null : reasons.join(" "),
    duplicatePrevented,
    validation,
  };
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

export async function executeInitialPaperworkAutoSend(input: {
  contexts: PaperworkAutomationContext[];
  advancements: CandidateAdvancementEvaluation[];
  auditEvents: PaperworkAutomationAuditEvent[];
  onboardingPolicy: CandidateOnboardingPolicy;
  dryRun: boolean;
  autoSendEnabled: boolean;
  userId: string;
  userEmail: string;
  referenceMs?: number;
}): Promise<InitialPaperworkExecutionSummary> {
  const started = Date.now();
  const referenceMs = input.referenceMs ?? started;
  const generatedAt = new Date(referenceMs).toISOString();
  const liveExecution = input.autoSendEnabled && !input.dryRun;
  const executionMode: "dry_run" | "live" = liveExecution ? "live" : "dry_run";

  const advancementById = new Map(input.advancements.map((evaluation) => [evaluation.candidateId, evaluation]));
  const queue = buildPaperworkQueue(input.contexts);
  const initialCandidates = queue.filter((item) => item.recommendedAction === "Send Initial Paperwork");
  const contextById = new Map(input.contexts.map((context) => [context.row.candidateId, context]));

  const summary: InitialPaperworkExecutionSummary = {
    sourcePhase: P147_SOURCE_PHASE,
    generatedAt,
    dryRun: !liveExecution,
    autoSendEnabled: input.autoSendEnabled,
    eligibleCount: 0,
    sentCount: 0,
    blockedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    duplicatesPrevented: 0,
    executionTimeMs: 0,
    items: [],
    executeBatchCalled: false,
    breezyWrites: false,
    paperworkSent: false,
  };

  let auditEvents = [...input.auditEvents];

  for (const item of initialCandidates) {
    const context = contextById.get(item.candidateId);
    const advancement = advancementById.get(item.candidateId);
    if (!context || !advancement) continue;

    const eligibility = evaluateInitialPaperworkEligibility({
      context,
      advancement,
      auditEvents,
      referenceMs,
    });

    if (eligibility.eligible) summary.eligibleCount += 1;

    const templateKey = resolveTemplateKey(context.row);
    let sendResult: InitialPaperworkSendResult = "skipped";
    let reason = liveExecution ? "" : "Dry run — initial paperwork not sent.";
    let signatureRequestId: string | null = null;

    if (eligibility.duplicatePrevented && !eligibility.eligible) {
      sendResult = "duplicatePrevented";
      summary.duplicatesPrevented += 1;
      summary.blockedCount += 1;
      reason = eligibility.blockedReason ?? "Duplicate prevented.";
    } else if (!eligibility.eligible) {
      sendResult = "blocked";
      summary.blockedCount += 1;
      reason = eligibility.blockedReason ?? "Not eligible.";
    } else if (!liveExecution) {
      sendResult = "skipped";
      summary.skippedCount += 1;
      reason = input.autoSendEnabled
        ? "Dry run requested — packet not sent."
        : "Auto-send disabled — dry run only.";
    } else {
      const packet = await sendPaperworkPacket({
        row: context.row,
        policy: buildAutonomousPolicy(input.onboardingPolicy),
        byUserId: input.userId,
        dryRun: false,
      });
      if (packet.ok && packet.sent) {
        sendResult = "sent";
        summary.sentCount += 1;
        summary.paperworkSent = true;
        signatureRequestId = packet.record.signatureRequestId ?? null;
        reason = `Initial paperwork sent — ${signatureRequestId ?? "queued"}.`;
      } else if (packet.ok && !packet.sent) {
        sendResult = "skipped";
        summary.skippedCount += 1;
        reason = "Packet prepared but not sent (policy gate).";
      } else {
        sendResult = "failed";
        summary.failedCount += 1;
        reason = !packet.ok ? packet.error : "Send failed.";
      }
    }

    const executionItem: InitialPaperworkExecutionItem = {
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      email: context.row.email?.trim() ?? "",
      project: item.project,
      jobId: context.row.positionId ?? null,
      recruiter: item.recruiter,
      paperworkTemplate: templateKey,
      recommendedAction: item.recommendedAction,
      advancementConfidence: advancement.confidence,
      sendResult,
      reason,
      blockedReason: eligibility.blockedReason,
      duplicatePrevented: eligibility.duplicatePrevented,
      validationResult: eligibility.validation,
      paperworkStatusBeforeSend: item.paperworkStatus,
      executionMode,
      signatureRequestId,
    };
    summary.items.push(executionItem);

    auditEvents = await appendPaperworkAutomationAuditEvent({
      type: sendResult === "sent" ? "initial_paperwork_sent" : "paperwork_sent",
      userId: input.userId,
      userEmail: input.userEmail,
      candidateId: item.candidateId,
      project: item.project,
      recommendedAction: "Send Initial Paperwork",
      reason,
      executed: sendResult === "sent",
      simulated: !liveExecution || sendResult !== "sent",
      candidateName: item.candidateName,
      email: context.row.email?.trim() ?? "",
      recruiter: item.recruiter,
      autoSendEligible: eligibility.eligible,
      sendResult:
        sendResult === "duplicatePrevented"
          ? "blocked"
          : sendResult === "skipped"
            ? "skipped"
            : sendResult,
      blockedReason: eligibility.blockedReason,
      paperworkStatusBeforeSend: item.paperworkStatus,
      templateUsed: templateKey,
      executionMode,
      jobId: context.row.positionId ?? undefined,
      validationResult: eligibility.validation,
      duplicatePrevented: eligibility.duplicatePrevented,
    });
  }

  summary.executionTimeMs = Date.now() - started;
  return summary;
}
