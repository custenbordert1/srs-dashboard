import type { AuthSession } from "@/lib/auth/types";
import { hoursSince } from "@/lib/candidate-action-sla";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { loadControlledPaperworkAutomationForSession } from "@/lib/p145-controlled-paperwork-automation/load-controlled-paperwork-automation";
import {
  buildOrchestratorStatusSnapshot,
  isAutonomousRecruitingEnabled,
} from "@/lib/recruiting/autonomous-recruiting-orchestrator";
import { isP146AutoSendEnabled } from "@/lib/recruiting/paperwork-execution-engine";
import { isP147InitialPaperworkAutoSendEnabled } from "@/lib/recruiting/initial-paperwork-execution-engine";
import { loadOrchestratorRunHistory } from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";
import type {
  ProductionAlert,
  ProductionOperationsSnapshot,
} from "@/lib/p149-autonomous-recruiting-production-readiness/types";
import { P149_SOURCE_PHASE } from "@/lib/p149-autonomous-recruiting-production-readiness/types";

function buildAlerts(input: {
  failures: string[];
  warnings: string[];
  blockedCandidates: number;
  lastSuccessfulRun: string | null;
  paperworkQueueCount: number;
}): ProductionAlert[] {
  const alerts: ProductionAlert[] = [];

  if (input.failures.length > 0) {
    alerts.push({
      id: "recent_failures",
      severity: "critical",
      message: "Recent orchestrator failures",
      detail: input.failures.slice(0, 3).join("; "),
    });
  }

  if (input.warnings.length > 2) {
    alerts.push({
      id: "repeated_warnings",
      severity: "warning",
      message: "Repeated warnings",
      detail: `${input.warnings.length} warnings in last run.`,
    });
  }

  if (input.blockedCandidates > 25) {
    alerts.push({
      id: "high_blocked",
      severity: "warning",
      message: "High blocked candidate count",
      detail: `${input.blockedCandidates} candidates blocked.`,
    });
  }

  if (input.paperworkQueueCount > 50) {
    alerts.push({
      id: "queue_backlog",
      severity: "warning",
      message: "Paperwork backlog exceeds threshold",
      detail: `${input.paperworkQueueCount} items in queue.`,
    });
  }

  if (input.lastSuccessfulRun) {
    const hours = hoursSince(input.lastSuccessfulRun, Date.now());
    if (hours != null && hours > 24) {
      alerts.push({
        id: "no_recent_success",
        severity: "critical",
        message: "No successful run within threshold",
        detail: `Last success ${Math.round(hours)}h ago.`,
      });
    }
  } else {
    alerts.push({
      id: "no_successful_run",
      severity: "warning",
      message: "No successful orchestrator run recorded",
      detail: "Run a dry-run cycle to establish baseline.",
    });
  }

  if (!isAutonomousRecruitingEnabled()) {
    alerts.push({
      id: "automation_disabled",
      severity: "warning",
      message: "Automation disabled",
      detail: "AUTONOMOUS_RECRUITING_ENABLED is false.",
    });
  }

  return alerts;
}

export async function buildProductionOperationsSnapshot(
  session: AuthSession,
): Promise<ProductionOperationsSnapshot> {
  const referenceMs = Date.now();
  const [status, paperwork, auditEvents, history] = await Promise.all([
    buildOrchestratorStatusSnapshot(),
    loadControlledPaperworkAutomationForSession(session, { executionMode: "approval" }),
    loadPaperworkAutomationAuditLog().catch(() => []),
    loadOrchestratorRunHistory().catch(() => []),
  ]);

  const snapshot = paperwork.ok ? paperwork.snapshot : null;
  const queue = snapshot?.queue ?? [];
  const validation = snapshot?.validation;

  const todayEvents = auditEvents.filter((event) => {
    const hours = hoursSince(event.at, referenceMs);
    return hours != null && hours < 24;
  });

  const paperworkSentToday = todayEvents.filter(
    (e) => e.sendResult === "sent" && e.type === "initial_paperwork_sent",
  ).length;
  const reminder1Today = todayEvents.filter(
    (e) => e.sendResult === "sent" && e.type === "reminder_sent" && e.templateUsed?.includes("1"),
  ).length;
  const reminder2Today = todayEvents.filter(
    (e) => e.sendResult === "sent" && e.type === "reminder_sent" && e.templateUsed?.includes("2"),
  ).length;

  const recentRuns = history.slice(0, 10);
  const successfulRuns = recentRuns.filter((r) => r.success && !r.skipped).length;
  const automationSuccessPercent =
    recentRuns.length > 0 ? Math.round((successfulRuns / recentRuns.length) * 100) : 100;

  const eligibleTouches =
    (snapshot?.initialPaperwork.eligibleCandidates ?? 0) +
    (snapshot?.autoSend.eligibleRemindersToday ?? 0);
  const estimatedRecruiterHoursSaved = Math.round(eligibleTouches * 0.25 * 10) / 10;

  const alerts = buildAlerts({
    failures: status.failures,
    warnings: status.warnings,
    blockedCandidates: status.blockedCandidates,
    lastSuccessfulRun: status.lastSuccessfulRun,
    paperworkQueueCount: status.paperworkQueueCount,
  });

  return {
    sourcePhase: P149_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    automationStatus: status.automationStatus,
    orchestratorEnabled: isAutonomousRecruitingEnabled(),
    lastRun: status.currentRun?.lockedAt ?? status.lastSuccessfulRun,
    lastSuccessfulRun: status.lastSuccessfulRun,
    nextRun: status.nextScheduledRun,
    failures: status.failures,
    warnings: status.warnings,
    candidatesProcessedToday: status.candidatesEvaluated,
    paperworkSentToday,
    reminder1Today,
    reminder2Today,
    blockedCandidates: status.blockedCandidates,
    automationSuccessPercent,
    averagePaperworkTurnaroundHours: validation?.averagePaperworkAgeHours ?? 0,
    estimatedRecruiterHoursSaved,
    alerts,
    executeBatchCalled: false,
    breezyWrites: false,
  };
}
