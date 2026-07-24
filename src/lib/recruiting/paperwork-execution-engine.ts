import { hoursSince } from "@/lib/candidate-action-sla";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import type {
  PaperworkAutomationContext,
  PaperworkQueueItem,
  PaperworkRecommendedAction,
} from "@/lib/recruiting/paperwork-automation-engine";
import {
  P145_COMMUNICATION_COOLDOWN_HOURS,
  P145_REMINDER_2_HOURS,
  buildPaperworkQueue,
  evaluatePaperworkCandidate,
} from "@/lib/recruiting/paperwork-automation-engine";
import { buildPaperworkReminderEmail } from "@/lib/recruiting/paperwork-reminder-templates";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import { appendPaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";

export const P146_AUTO_SEND_CONFIDENCE_MIN = 80;
export const P146_MAX_REMINDERS_PER_CANDIDATE = 2;
export const P146_REMINDER_GAP_HOURS = 48;

const AUTO_SEND_ACTIONS = new Set<PaperworkRecommendedAction>(["Send Reminder #1", "Send Reminder #2"]);

export type AutoSendSendResult = "sent" | "skipped" | "blocked" | "failed";

export type AutoSendCooldownCheck = {
  passed: boolean;
  reason: string;
};

export type AutoSendEligibility = {
  eligible: boolean;
  autoSendEligible: boolean;
  blockedReason: string | null;
  cooldownCheck: AutoSendCooldownCheck;
  reminderCount: number;
};

export type AutoSendExecutionItem = {
  candidateId: string;
  candidateName: string;
  email: string;
  project: string;
  recruiter: string;
  recommendedAction: PaperworkRecommendedAction;
  autoSendEligible: boolean;
  sendResult: AutoSendSendResult;
  reason: string;
  blockedReason: string | null;
  cooldownCheck: AutoSendCooldownCheck;
  paperworkStatusBeforeSend: string;
  templateUsed: string | null;
  executionMode: "dry_run" | "live";
};

export type AutoSendExecutionSummary = {
  generatedAt: string;
  dryRun: boolean;
  autoSendEnabled: boolean;
  eligibleCount: number;
  sentCount: number;
  skippedCount: number;
  blockedCount: number;
  failedCount: number;
  duplicatesPrevented: number;
  cooldownBlocked: number;
  manualReviewRequired: number;
  items: AutoSendExecutionItem[];
  executeBatchCalled: false;
  breezyWrites: false;
  paperworkSent: boolean;
};

export function isP146AutoSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P146_AUTO_SEND_PAPERWORK_REMINDERS_ENABLED === "true";
}

function isReminderAction(action: PaperworkRecommendedAction): action is "Send Reminder #1" | "Send Reminder #2" {
  return AUTO_SEND_ACTIONS.has(action);
}

function reminderSendsForCandidate(
  auditEvents: PaperworkAutomationAuditEvent[],
  candidateId: string,
): PaperworkAutomationAuditEvent[] {
  return auditEvents.filter(
    (event) =>
      event.candidateId === candidateId &&
      event.sendResult === "sent" &&
      (event.recommendedAction === "Send Reminder #1" || event.recommendedAction === "Send Reminder #2"),
  );
}

function sentToday(
  auditEvents: PaperworkAutomationAuditEvent[],
  candidateId: string,
  referenceMs: number,
): boolean {
  const recent = reminderSendsForCandidate(auditEvents, candidateId).find((event) => {
    const hours = hoursSince(event.at, referenceMs);
    return hours != null && hours < 24;
  });
  return Boolean(recent);
}

function lastPaperworkEmailAt(
  item: PaperworkQueueItem,
  auditEvents: PaperworkAutomationAuditEvent[],
): string | null {
  const fromAudit = auditEvents
    .filter((event) => event.candidateId === item.candidateId && event.type === "reminder_sent")
    .map((event) => event.at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return fromAudit ?? item.lastCommunication;
}

function evaluateCooldown(input: {
  item: PaperworkQueueItem;
  auditEvents: PaperworkAutomationAuditEvent[];
  referenceMs: number;
  action: "Send Reminder #1" | "Send Reminder #2";
}): AutoSendCooldownCheck {
  const reminderCount = reminderSendsForCandidate(input.auditEvents, input.item.candidateId).length;
  if (reminderCount >= P146_MAX_REMINDERS_PER_CANDIDATE) {
    return {
      passed: false,
      reason: `Maximum ${P146_MAX_REMINDERS_PER_CANDIDATE} reminders already sent — manual review required.`,
    };
  }
  if (sentToday(input.auditEvents, input.item.candidateId, input.referenceMs)) {
    return { passed: false, reason: "Reminder already sent within the last 24 hours." };
  }
  const lastEmailAt = lastPaperworkEmailAt(input.item, input.auditEvents);
  const hoursSinceEmail = lastEmailAt ? hoursSince(lastEmailAt, input.referenceMs) : null;
  if (hoursSinceEmail != null && hoursSinceEmail < P145_COMMUNICATION_COOLDOWN_HOURS) {
    return {
      passed: false,
      reason: `Last paperwork email was ${hoursSinceEmail}h ago — minimum ${P145_COMMUNICATION_COOLDOWN_HOURS}h cooldown.`,
    };
  }
  if (input.action === "Send Reminder #2") {
    const reminder1 = reminderSendsForCandidate(input.auditEvents, input.item.candidateId).find(
      (event) => event.recommendedAction === "Send Reminder #1",
    );
    if (reminder1) {
      const gap = hoursSince(reminder1.at, input.referenceMs);
      if (gap != null && gap < P146_REMINDER_GAP_HOURS) {
        return {
          passed: false,
          reason: `Reminder #1 was ${gap}h ago — minimum ${P146_REMINDER_GAP_HOURS}h before Reminder #2.`,
        };
      }
    } else if ((input.item.paperworkAgeHours ?? 0) < P145_REMINDER_2_HOURS) {
      return {
        passed: false,
        reason: `Paperwork age ${input.item.paperworkAgeHours ?? 0}h — Reminder #2 requires ${P145_REMINDER_2_HOURS}h.`,
      };
    }
  }
  return { passed: true, reason: "Cooldown checks passed." };
}

export function evaluateAutoSendEligibility(input: {
  item: PaperworkQueueItem;
  context: PaperworkAutomationContext;
  auditEvents: PaperworkAutomationAuditEvent[];
  referenceMs?: number;
}): AutoSendEligibility {
  const referenceMs = input.referenceMs ?? Date.now();
  const fresh = evaluatePaperworkCandidate({ ...input.context, referenceMs });
  const item = fresh ?? input.item;

  if (!isReminderAction(item.recommendedAction)) {
    return {
      eligible: false,
      autoSendEligible: false,
      blockedReason: `Action "${item.recommendedAction}" is not auto-send eligible.`,
      cooldownCheck: { passed: false, reason: "Not a reminder action." },
      reminderCount: reminderSendsForCandidate(input.auditEvents, item.candidateId).length,
    };
  }

  const cooldownCheck = evaluateCooldown({
    item,
    auditEvents: input.auditEvents,
    referenceMs,
    action: item.recommendedAction,
  });
  const reminderCount = reminderSendsForCandidate(input.auditEvents, item.candidateId).length;

  if (item.blockers.length > 0) {
    return {
      eligible: false,
      autoSendEligible: false,
      blockedReason: `Blockers: ${item.blockers.join(", ")}.`,
      cooldownCheck,
      reminderCount,
    };
  }
  if (item.confidence < P146_AUTO_SEND_CONFIDENCE_MIN) {
    return {
      eligible: false,
      autoSendEligible: false,
      blockedReason: `Confidence ${item.confidence}% below ${P146_AUTO_SEND_CONFIDENCE_MIN}% threshold.`,
      cooldownCheck,
      reminderCount,
    };
  }
  if (!item.paperworkAgeHours && item.paperworkStatus === "not_sent") {
    return {
      eligible: false,
      autoSendEligible: false,
      blockedReason: "Initial paperwork has not been sent — auto-send blocked.",
      cooldownCheck,
      reminderCount,
    };
  }
  if (!cooldownCheck.passed) {
    return {
      eligible: false,
      autoSendEligible: false,
      blockedReason: cooldownCheck.reason,
      cooldownCheck,
      reminderCount,
    };
  }

  return {
    eligible: true,
    autoSendEligible: true,
    blockedReason: null,
    cooldownCheck,
    reminderCount,
  };
}

function recruitingEmailFrom(): string {
  return (
    process.env.SRS_RECRUITING_FROM_EMAIL?.trim() ||
    process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() ||
    "recruiting@strategicretailsolutions.com"
  );
}

function recruitingReplyTo(): string {
  return process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() || recruitingEmailFrom();
}

export async function executeAutoSendPaperworkReminders(input: {
  contexts: PaperworkAutomationContext[];
  auditEvents: PaperworkAutomationAuditEvent[];
  dryRun: boolean;
  autoSendEnabled: boolean;
  userId: string;
  userEmail: string;
  referenceMs?: number;
}): Promise<AutoSendExecutionSummary> {
  const referenceMs = input.referenceMs ?? Date.now();
  const generatedAt = new Date(referenceMs).toISOString();
  const queue = buildPaperworkQueue(input.contexts);
  const contextById = new Map(input.contexts.map((context) => [context.row.candidateId, context]));

  const summary: AutoSendExecutionSummary = {
    generatedAt,
    dryRun: input.dryRun || !input.autoSendEnabled,
    autoSendEnabled: input.autoSendEnabled,
    eligibleCount: 0,
    sentCount: 0,
    skippedCount: 0,
    blockedCount: 0,
    failedCount: 0,
    duplicatesPrevented: 0,
    cooldownBlocked: 0,
    manualReviewRequired: 0,
    items: [],
    executeBatchCalled: false,
    breezyWrites: false,
    paperworkSent: false,
  };

  const liveExecution = input.autoSendEnabled && !input.dryRun;
  const executionMode: "dry_run" | "live" = liveExecution ? "live" : "dry_run";
  let auditEvents = [...input.auditEvents];

  for (const item of queue) {
    if (!isReminderAction(item.recommendedAction)) {
      if (item.recommendedAction === "Manual Review") summary.manualReviewRequired += 1;
      continue;
    }

    const context = contextById.get(item.candidateId);
    if (!context) continue;

    const eligibility = evaluateAutoSendEligibility({
      item,
      context,
      auditEvents,
      referenceMs,
    });

    if (eligibility.autoSendEligible) summary.eligibleCount += 1;

    let sendResult: AutoSendSendResult = "skipped";
    let reason = "Dry run — no email sent.";
    let templateUsed: string | null = null;

    if (!eligibility.autoSendEligible) {
      sendResult = eligibility.blockedReason?.includes("Duplicate") ? "blocked" : "blocked";
      if (eligibility.blockedReason?.includes("Duplicate")) summary.duplicatesPrevented += 1;
      if (!eligibility.cooldownCheck.passed) summary.cooldownBlocked += 1;
      else summary.blockedCount += 1;
      reason = eligibility.blockedReason ?? "Not eligible for auto-send.";
    } else if (!liveExecution) {
      sendResult = "skipped";
      summary.skippedCount += 1;
      reason = input.autoSendEnabled
        ? "Dry run requested — reminder not sent."
        : "Auto-send disabled — dry run only.";
      templateUsed = resolveTemplateId(item.recommendedAction);
    } else {
      const emailContent = buildPaperworkReminderEmail({
        row: context.row,
        action: item.recommendedAction,
      });
      templateUsed = emailContent.templateId;
      const email = context.row.email?.trim();
      if (!email) {
        sendResult = "failed";
        summary.failedCount += 1;
        reason = "Missing candidate email.";
      } else {
        const result = await sendTransactionalEmail(
          {
            from: recruitingEmailFrom(),
            replyTo: recruitingReplyTo(),
            to: email,
            subject: emailContent.subject,
            text: emailContent.text,
            tags: ["p146", "paperwork-reminder", emailContent.templateId],
          },
          {
            phase: "P146",
            candidateId: item.candidateId,
            recommendedAction: item.recommendedAction,
            templateId: emailContent.templateId,
          },
          { requireLiveDelivery: true },
        );
        if (result.ok && result.mode === "resend") {
          sendResult = "sent";
          summary.sentCount += 1;
          summary.paperworkSent = true;
          reason = `Reminder sent via ${result.mode}.`;
        } else if (result.ok && result.mode === "log") {
          sendResult = "failed";
          summary.failedCount += 1;
          reason =
            "Mailer logged to outbox only; live Resend required for P146 auto-send (set DIRECT_DEPOSIT_EMAIL_MODE=resend and RESEND_API_KEY).";
        } else {
          sendResult = "failed";
          summary.failedCount += 1;
          reason = result.error ?? "Email send failed.";
        }
      }
    }

    const executionItem: AutoSendExecutionItem = {
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      email: context.row.email?.trim() ?? "",
      project: item.project,
      recruiter: item.recruiter,
      recommendedAction: item.recommendedAction,
      autoSendEligible: eligibility.autoSendEligible,
      sendResult,
      reason,
      blockedReason: eligibility.blockedReason,
      cooldownCheck: eligibility.cooldownCheck,
      paperworkStatusBeforeSend: item.paperworkStatus,
      templateUsed,
      executionMode,
    };
    summary.items.push(executionItem);

    auditEvents = await appendPaperworkAutomationAuditEvent({
      type: sendResult === "sent" ? "reminder_sent" : "paperwork_sent",
      userId: input.userId,
      userEmail: input.userEmail,
      candidateId: item.candidateId,
      project: item.project,
      recommendedAction: item.recommendedAction,
      reason,
      executed: sendResult === "sent",
      simulated: !liveExecution || sendResult !== "sent",
      candidateName: item.candidateName,
      email: context.row.email?.trim() ?? "",
      recruiter: item.recruiter,
      autoSendEligible: eligibility.autoSendEligible,
      sendResult,
      blockedReason: eligibility.blockedReason,
      cooldownCheck: eligibility.cooldownCheck,
      paperworkStatusBeforeSend: item.paperworkStatus,
      templateUsed,
      executionMode,
    });
  }

  return summary;
}

function resolveTemplateId(action: "Send Reminder #1" | "Send Reminder #2"): string {
  return action === "Send Reminder #1" ? "p146_paperwork_reminder_1" : "p146_paperwork_reminder_2";
}

export function buildDryRunSummaryFromQueue(input: {
  contexts: PaperworkAutomationContext[];
  auditEvents: PaperworkAutomationAuditEvent[];
  referenceMs?: number;
}): Pick<
  AutoSendExecutionSummary,
  | "eligibleCount"
  | "blockedCount"
  | "cooldownBlocked"
  | "manualReviewRequired"
  | "duplicatesPrevented"
> {
  const referenceMs = input.referenceMs ?? Date.now();
  const queue = buildPaperworkQueue(input.contexts);
  const contextById = new Map(input.contexts.map((context) => [context.row.candidateId, context]));

  let eligibleCount = 0;
  let blockedCount = 0;
  let cooldownBlocked = 0;
  let manualReviewRequired = 0;
  let duplicatesPrevented = 0;

  for (const item of queue) {
    if (item.recommendedAction === "Manual Review") manualReviewRequired += 1;
    if (!isReminderAction(item.recommendedAction)) continue;
    const context = contextById.get(item.candidateId);
    if (!context) continue;
    const eligibility = evaluateAutoSendEligibility({
      item,
      context,
      auditEvents: input.auditEvents,
      referenceMs,
    });
    if (eligibility.autoSendEligible) eligibleCount += 1;
    else {
      blockedCount += 1;
      if (!eligibility.cooldownCheck.passed) cooldownBlocked += 1;
      if (eligibility.blockedReason?.includes("Duplicate")) duplicatesPrevented += 1;
    }
  }

  return { eligibleCount, blockedCount, cooldownBlocked, manualReviewRequired, duplicatesPrevented };
}
