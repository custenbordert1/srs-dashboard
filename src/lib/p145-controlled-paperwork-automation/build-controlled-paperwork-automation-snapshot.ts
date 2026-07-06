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

export function buildControlledPaperworkAutomationSnapshot(input: {
  queue: PaperworkQueueItem[];
  generatedAt: string;
  partialSync: boolean;
  candidatesEvaluated: number;
  recentAuditEvents: PaperworkAutomationAuditEvent[];
  executionMode?: P145ExecutionMode;
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
  };
}
