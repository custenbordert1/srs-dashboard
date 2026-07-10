import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import type {
  ControlledPaperworkAutomationSnapshot,
  PaperworkApprovalQueueRow,
  PaperworkAutomationAuditEvent,
  PaperworkExecutiveMetrics,
  PaperworkValidationReport,
  P145ExecutionMode,
} from "@/lib/p145-controlled-paperwork-automation/types";
import {
  P145_DEFAULT_MODE,
  P145_SOURCE_PHASE,
} from "@/lib/p145-controlled-paperwork-automation/types";
import type { PaperworkQueueItem } from "@/lib/recruiting/paperwork-automation-engine";
import { isP145ExecutionEnabled } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import {
  buildDryRunSummaryFromQueue,
  isP146AutoSendEnabled,
  type AutoSendExecutionSummary,
} from "@/lib/recruiting/paperwork-execution-engine";
import {
  evaluateInitialPaperworkEligibility,
  isP147InitialPaperworkAutoSendEnabled,
  type InitialPaperworkExecutionSummary,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import type { CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";
import type { PaperworkAutomationContext } from "@/lib/recruiting/paperwork-automation-engine";
import { hoursSince } from "@/lib/candidate-action-sla";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function groupCount(
  queue: PaperworkQueueItem[],
  key: "recruiter" | "project",
): Array<{ label: string; count: number }> {
  const map = new Map<string, number>();
  for (const item of queue) {
    const label = key === "recruiter" ? item.recruiter : item.project;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function buildExecutiveMetrics(queue: PaperworkQueueItem[]): PaperworkExecutiveMetrics {
  const readyToSend = queue.filter((q) => q.recommendedAction === "Send Initial Paperwork").length;
  const readyForReminder = queue.filter((q) =>
    ["Send Reminder #1", "Send Reminder #2"].includes(q.recommendedAction),
  ).length;
  const waitingOnCandidate = queue.filter(
    (q) => q.recommendedAction === "Wait" && q.paperworkStatus === "viewed",
  ).length;
  const manualReviewRequired = queue.filter(
    (q) => q.recommendedAction === "Manual Review" || q.blockers.includes("Manual Review Required"),
  ).length;
  const ages = queue.map((q) => q.paperworkAgeHours).filter((h): h is number => h != null);

  const recruiterGroups = groupCount(queue, "recruiter");
  const projectGroups = groupCount(queue, "project");

  return {
    outstandingPaperwork: queue.length,
    readyToSend,
    readyForReminder,
    waitingOnCandidate,
    manualReviewRequired,
    averageDaysWaiting: average(ages) > 0 ? Math.round(average(ages) / 24) : 0,
    recruitersWithLargestQueue: recruiterGroups.map((r) => ({
      recruiter: r.label,
      count: r.count,
    })),
    projectsWithMostOutstanding: projectGroups.map((p) => ({
      project: p.label,
      count: p.count,
    })),
  };
}

function buildValidationReport(queue: PaperworkQueueItem[]): PaperworkValidationReport {
  const ages = queue.map((q) => q.paperworkAgeHours).filter((h): h is number => h != null);
  const responseGaps = queue
    .map((q) => {
      if (!q.lastCommunication || q.paperworkAgeHours == null) return null;
      return q.paperworkAgeHours;
    })
    .filter((h): h is number => h != null);

  return {
    outstandingPaperworkCount: queue.length,
    initialPaperworkCount: queue.filter((q) => q.recommendedAction === "Send Initial Paperwork").length,
    reminder1Count: queue.filter((q) => q.recommendedAction === "Send Reminder #1").length,
    reminder2Count: queue.filter((q) => q.recommendedAction === "Send Reminder #2").length,
    manualReviewCount: queue.filter((q) => q.recommendedAction === "Manual Review").length,
    averagePaperworkAgeHours: average(ages),
    averageResponseTimeHours: average(responseGaps),
    topProjectsByOutstanding: groupCount(queue, "project").map((p) => ({
      project: p.label,
      count: p.count,
    })),
    topRecruitersByWorkload: groupCount(queue, "recruiter").map((r) => ({
      recruiter: r.label,
      count: r.count,
    })),
  };
}

function buildApprovalQueue(
  queue: PaperworkQueueItem[],
  auditEvents: PaperworkAutomationAuditEvent[],
  executionMode: P145ExecutionMode,
): PaperworkApprovalQueueRow[] {
  const approved = new Set(
    auditEvents.filter((e) => e.type === "approval_given").map((e) => e.candidateId),
  );
  const rejected = new Set(
    auditEvents.filter((e) => e.type === "approval_rejected").map((e) => e.candidateId),
  );

  return queue.map((item) => {
    const approvalStatus = approved.has(item.candidateId)
      ? "approved"
      : rejected.has(item.candidateId)
        ? "rejected"
        : "pending";
    const actionable =
      executionMode === "approval" &&
      approvalStatus === "pending" &&
      !item.blockers.includes("Recent Contact Cooldown") &&
      item.recommendedAction !== "Wait" &&
      item.recommendedAction !== "Archive";

    return {
      ...item,
      selected: false,
      approvalStatus,
      approveEnabled: actionable,
      rejectEnabled: approvalStatus === "pending",
    };
  });
}

function buildAutoSendMetrics(input: {
  queue: PaperworkQueueItem[];
  auditEvents: PaperworkAutomationAuditEvent[];
  contexts?: PaperworkAutomationContext[];
  lastAutoSendSummary?: AutoSendExecutionSummary | null;
  referenceMs?: number;
}): ControlledPaperworkAutomationSnapshot["autoSend"] {
  const referenceMs = input.referenceMs ?? Date.now();
  const dryRun =
    input.contexts && input.contexts.length > 0
      ? buildDryRunSummaryFromQueue({
          contexts: input.contexts,
          auditEvents: input.auditEvents,
          referenceMs,
        })
      : {
          eligibleCount: 0,
          blockedCount: 0,
          cooldownBlocked: 0,
          manualReviewRequired: 0,
          duplicatesPrevented: 0,
        };

  const sentToday = input.auditEvents.filter((event) => {
    if (event.sendResult !== "sent" || event.type !== "reminder_sent") return false;
    const hours = hoursSince(event.at, referenceMs);
    return hours != null && hours < 24;
  }).length;

  const sentTotal = input.lastAutoSendSummary?.sentCount ?? sentToday;
  const attempted = input.lastAutoSendSummary?.items.filter((item) => item.autoSendEligible).length ?? 0;
  const successRate =
    attempted > 0 ? Math.round((sentTotal / attempted) * 100) : sentToday > 0 ? 100 : 0;

  const waiting = input.queue.filter(
    (item) =>
      ["Send Reminder #1", "Send Reminder #2", "Wait"].includes(item.recommendedAction) &&
      item.paperworkStatus !== "signed",
  ).length;

  return {
    autoSendEnabled: isP146AutoSendEnabled(),
    eligibleRemindersToday: dryRun.eligibleCount,
    sentToday,
    skipped: input.lastAutoSendSummary?.skippedCount ?? 0,
    blocked: input.lastAutoSendSummary?.blockedCount ?? dryRun.blockedCount,
    failures: input.lastAutoSendSummary?.failedCount ?? 0,
    cooldownBlocked: input.lastAutoSendSummary?.cooldownBlocked ?? dryRun.cooldownBlocked,
    manualReviewRequired:
      input.lastAutoSendSummary?.manualReviewRequired ?? dryRun.manualReviewRequired,
    duplicatesPrevented:
      input.lastAutoSendSummary?.duplicatesPrevented ?? dryRun.duplicatesPrevented,
    reminderSuccessRate: successRate,
    candidatesStillWaiting: waiting,
  };
}

function buildInitialPaperworkMetrics(input: {
  queue: PaperworkQueueItem[];
  auditEvents: PaperworkAutomationAuditEvent[];
  contexts?: PaperworkAutomationContext[];
  advancements?: CandidateAdvancementEvaluation[];
  lastInitialPaperworkSummary?: InitialPaperworkExecutionSummary | null;
  referenceMs?: number;
}): ControlledPaperworkAutomationSnapshot["initialPaperwork"] {
  const referenceMs = input.referenceMs ?? Date.now();
  const sentToday = input.auditEvents.filter((event) => {
    if (event.type !== "initial_paperwork_sent" || event.sendResult !== "sent") return false;
    const hours = hoursSince(event.at, referenceMs);
    return hours != null && hours < 24;
  }).length;

  let eligibleCandidates = input.lastInitialPaperworkSummary?.eligibleCount ?? 0;
  let blockedCandidates = input.lastInitialPaperworkSummary?.blockedCount ?? 0;
  let duplicatesPrevented = input.lastInitialPaperworkSummary?.duplicatesPrevented ?? 0;

  if (
    !input.lastInitialPaperworkSummary &&
    input.contexts &&
    input.advancements &&
    input.contexts.length > 0
  ) {
    const advancementById = new Map(input.advancements.map((e) => [e.candidateId, e]));
    for (const context of input.contexts) {
      const advancement = advancementById.get(context.row.candidateId);
      if (!advancement) continue;
      const item = input.queue.find((q) => q.candidateId === context.row.candidateId);
      if (!item || item.recommendedAction !== "Send Initial Paperwork") continue;
      const eligibility = evaluateInitialPaperworkEligibility({
        context,
        advancement,
        auditEvents: input.auditEvents,
        referenceMs,
      });
      if (eligibility.eligible) eligibleCandidates += 1;
      else blockedCandidates += 1;
      if (eligibility.duplicatePrevented) duplicatesPrevented += 1;
    }
  }

  const initialQueue = input.queue.filter((q) => q.recommendedAction === "Send Initial Paperwork");
  const ages = initialQueue
    .map((q) => q.paperworkAgeHours)
    .filter((h): h is number => h != null);
  const averageTimeToPaperworkHours =
    ages.length > 0
      ? Math.round(ages.reduce((sum, h) => sum + h, 0) / ages.length)
      : 0;

  const attempted = input.lastInitialPaperworkSummary?.eligibleCount ?? eligibleCandidates;
  const sent = input.lastInitialPaperworkSummary?.sentCount ?? sentToday;
  const executionSuccessRate = attempted > 0 ? Math.round((sent / attempted) * 100) : 0;

  return {
    autoSendEnabled: isP147InitialPaperworkAutoSendEnabled(),
    initialPaperworkSentToday: sentToday,
    eligibleCandidates,
    blockedCandidates,
    duplicatesPrevented,
    executionSuccessRate,
    averageTimeToPaperworkHours,
  };
}

export function buildControlledPaperworkAutomationSnapshot(input: {
  queue: PaperworkQueueItem[];
  generatedAt: string;
  partialSync: boolean;
  candidatesEvaluated: number;
  recentAuditEvents: PaperworkAutomationAuditEvent[];
  executionMode?: P145ExecutionMode;
  contexts?: PaperworkAutomationContext[];
  advancements?: CandidateAdvancementEvaluation[];
  lastAutoSendSummary?: AutoSendExecutionSummary | null;
  lastInitialPaperworkSummary?: InitialPaperworkExecutionSummary | null;
  referenceMs?: number;
}): ControlledPaperworkAutomationSnapshot {
  const pilot = loadPilotConfig();
  const executionMode = input.executionMode ?? "preview";
  const approvalQueue = buildApprovalQueue(input.queue, input.recentAuditEvents, executionMode);

  return {
    sourcePhase: P145_SOURCE_PHASE,
    generatedAt: input.generatedAt,
    mode: P145_DEFAULT_MODE,
    executionMode,
    partialSync: input.partialSync,
    candidatesEvaluated: input.candidatesEvaluated,
    queue: input.queue,
    approvalQueue,
    executive: buildExecutiveMetrics(input.queue),
    validation: buildValidationReport(input.queue),
    recentAuditEvents: input.recentAuditEvents.slice(0, 25),
    executeBatchCalled: false,
    breezyWrites: false,
    paperworkSent: false,
    liveModeEnabled: pilot.liveModeEnabled,
    executionEnabled: isP145ExecutionEnabled(),
    autoSend: buildAutoSendMetrics({
      queue: input.queue,
      auditEvents: input.recentAuditEvents,
      contexts: input.contexts,
      lastAutoSendSummary: input.lastAutoSendSummary ?? null,
      referenceMs: input.referenceMs,
    }),
    lastAutoSendSummary: input.lastAutoSendSummary ?? null,
    initialPaperwork: buildInitialPaperworkMetrics({
      queue: input.queue,
      auditEvents: input.recentAuditEvents,
      contexts: input.contexts,
      advancements: input.advancements,
      lastInitialPaperworkSummary: input.lastInitialPaperworkSummary ?? null,
      referenceMs: input.referenceMs,
    }),
    lastInitialPaperworkSummary: input.lastInitialPaperworkSummary ?? null,
  };
}
