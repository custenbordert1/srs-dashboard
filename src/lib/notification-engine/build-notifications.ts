import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AuthSession } from "@/lib/auth/types";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateSlaSnapshot,
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { getAssignedStatesForDm, normalizeStateCode } from "@/lib/dm-territory-map";
import { candidatesForJob } from "@/lib/dm-dashboard/territory-shared";
import { buildNotificationSourceKey } from "@/lib/notification-engine/dedupe";
import {
  AUTOMATION_RULES,
  CANDIDATE_AGING_NOTIFICATION_DAYS,
  COVERAGE_RISK_NOTIFICATION_THRESHOLD,
  OPEN_CALL_INACTIVITY_DAYS,
  PAPERWORK_PENDING_NOTIFICATION_HOURS,
  RECRUITER_WORKLOAD_NOTIFICATION_THRESHOLD,
} from "@/lib/notification-engine/notification-rules";
import type {
  NotificationAudience,
  NotificationCenterSnapshot,
  NotificationMetrics,
  NotificationRecord,
  NotificationRuleId,
  NotificationSeverity,
  NotificationStoreOverlay,
} from "@/lib/notification-engine/types";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";

export type NotificationBuildContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  fetchedAt: string;
  workflows: CandidateWorkflowState | null;
  coverage: CoverageRiskSnapshot | null;
  territoryStates?: string[] | null;
};

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function matchesTerritory(states: string[], territoryStates?: string[] | null): boolean {
  if (!territoryStates || territoryStates.length === 0) return true;
  const allowed = new Set(territoryStates.map(normalizeStateCode));
  return states.some((state) => allowed.has(normalizeStateCode(state)));
}

function makeNotification(
  ctx: NotificationBuildContext,
  input: {
    ruleId: NotificationRuleId;
    title: string;
    message: string;
    severity: NotificationSeverity;
    audience: NotificationAudience;
    sourceParts: Array<string | null | undefined>;
    recruiterName?: string | null;
    dmName?: NotificationRecord["dmName"];
    territoryStates?: string[];
    state?: string | null;
    city?: string | null;
    candidateId?: string | null;
    jobId?: string | null;
  },
): NotificationRecord {
  const sourceKey = buildNotificationSourceKey(input.ruleId, input.sourceParts);
  const rule = AUTOMATION_RULES.find((row) => row.id === input.ruleId);
  const now = ctx.fetchedAt;

  return {
    id: sourceKey,
    sourceKey,
    ruleId: input.ruleId,
    title: input.title,
    message: input.message,
    severity: input.severity,
    audience: input.audience,
    recruiterName: input.recruiterName ?? null,
    dmName: input.dmName ?? null,
    territoryStates: input.territoryStates ?? [],
    state: input.state ?? null,
    city: input.city ?? null,
    candidateId: input.candidateId ?? null,
    jobId: input.jobId ?? null,
    channels: rule?.channels ?? ["in-app"],
    status: "active",
    createdAt: now,
    updatedAt: now,
    readAt: null,
    dismissedAt: null,
    resolvedAt: null,
    auditHistory: [],
  };
}

function buildRecruiterNotifications(ctx: NotificationBuildContext): NotificationRecord[] {
  if (!ctx.workflows) return [];
  const referenceMs = Date.parse(ctx.fetchedAt);
  const notifications: NotificationRecord[] = [];

  for (const candidate of ctx.candidates) {
    const workflow = ctx.workflows[candidate.candidateId];
    const row = buildBaselineWorkflowRow(candidate, workflow);
    const recruiter = row.assignedRecruiter?.trim() || "Unassigned";
    if (isUnassignedRecruiter(recruiter)) continue;

    const states = [normalizeStateCode(row.state)].filter((s) => s.length === 2);
    if (!matchesTerritory(states, ctx.territoryStates)) continue;

    const sla = buildCandidateSlaSnapshot({
      appliedDate: row.appliedDate,
      workflowStatus: row.workflowStatus,
      lastActionAt: row.lastActionAt,
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      snoozedUntil: row.snoozedUntil,
      referenceMs,
    });
    if (sla.isSnoozed) continue;

    const displayName = `${row.firstName} ${row.lastName}`.trim() || row.email || row.candidateId;
    const base = {
      recruiterName: recruiter,
      territoryStates: states,
      state: row.state,
      city: row.city,
      candidateId: row.candidateId,
    };

    const appliedToday = calendarDaysSince(row.appliedDate, referenceMs) === 0;
    if (appliedToday && (row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review")) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "recruiter-new-applicant",
          title: "New applicant assigned",
          message: `${displayName} applied in ${row.city}, ${row.state}`,
          severity: "info",
          audience: "recruiter",
          sourceParts: [recruiter, row.candidateId, row.appliedDate],
          ...base,
        }),
      );
    }

    if (
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      })
    ) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "recruiter-follow-up-due",
          title: "Follow-up due",
          message: `Follow up with ${displayName} in ${row.city}, ${row.state}`,
          severity: sla.followUpDueSeverity === "critical" ? "critical" : "warning",
          audience: "recruiter",
          sourceParts: [recruiter, row.candidateId, "follow-up"],
          ...base,
        }),
      );
    }

    if (
      (sla.appliedDays ?? 0) >= CANDIDATE_AGING_NOTIFICATION_DAYS &&
      (row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review")
    ) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "recruiter-candidate-aging",
          title: "Candidate aging",
          message: `${displayName} has been in applied stage for ${sla.appliedDays} days`,
          severity: sla.appliedAgingSeverity === "critical" ? "critical" : "warning",
          audience: "recruiter",
          sourceParts: [recruiter, row.candidateId, "aging"],
          ...base,
        }),
      );
    }

    if (row.workflowStatus === "Qualified" || row.workflowStatus === "Paperwork Needed") {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "recruiter-paperwork-not-started",
          title: "Paperwork not started",
          message: `Send paperwork to ${displayName}`,
          severity: "warning",
          audience: "recruiter",
          sourceParts: [recruiter, row.candidateId, "paperwork-needed"],
          ...base,
        }),
      );
    }

    if (row.workflowStatus === "Paperwork Sent" && row.paperworkSentAt) {
      const pendingHours = hoursSince(row.paperworkSentAt, referenceMs);
      if (pendingHours !== null && pendingHours >= PAPERWORK_PENDING_NOTIFICATION_HOURS) {
        notifications.push(
          makeNotification(ctx, {
            ruleId: "recruiter-paperwork-pending",
            title: "Paperwork pending",
            message: `${displayName} paperwork unsigned for ${pendingHours}h`,
            severity: pendingHours >= PAPERWORK_PENDING_NOTIFICATION_HOURS * 2 ? "critical" : "warning",
            audience: "recruiter",
            sourceParts: [recruiter, row.candidateId, "paperwork-pending"],
            ...base,
          }),
        );
      }
    }
  }

  return notifications;
}

function buildDmNotifications(ctx: NotificationBuildContext): NotificationRecord[] {
  const center = buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  });

  const notifications: NotificationRecord[] = [];

  for (const territory of center.territories) {
    if (!matchesTerritory(territory.states, ctx.territoryStates)) continue;
    const metrics = territory.metrics;
    const base = {
      dmName: territory.dmName,
      territoryStates: territory.states,
    };

    if (metrics.coverageRiskScore >= COVERAGE_RISK_NOTIFICATION_THRESHOLD) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "dm-coverage-risk",
          title: "Coverage risk exceeds threshold",
          message: `${territory.dmName} coverage risk ${metrics.coverageRiskScore}/100`,
          severity: metrics.coverageRiskScore >= 80 ? "critical" : "warning",
          audience: "dm",
          sourceParts: [territory.dmName, "coverage-risk"],
          ...base,
        }),
      );
    }

    if (metrics.zeroApplicantJobs > 0) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "dm-zero-applicant-jobs",
          title: "Zero-applicant jobs",
          message: `${metrics.zeroApplicantJobs} job(s) with zero applicants in ${territory.dmName} territory`,
          severity: metrics.zeroApplicantJobs >= 3 ? "critical" : "warning",
          audience: "dm",
          sourceParts: [territory.dmName, "zero-applicants"],
          ...base,
        }),
      );
    }

    if (metrics.lowApplicantFlowJobs > 0) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "dm-low-applicant-flow",
          title: "Low applicant flow",
          message: `${metrics.lowApplicantFlowJobs} job(s) with low applicant flow`,
          severity: "info",
          audience: "dm",
          sourceParts: [territory.dmName, "low-flow"],
          ...base,
        }),
      );
    }

    if (
      metrics.applicantVelocity.direction === "down" &&
      metrics.applicantVelocity.delta <= -3
    ) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "dm-territory-health-declining",
          title: "Territory health declining",
          message: `Applicant velocity down ${Math.abs(metrics.applicantVelocity.delta)} vs prior week`,
          severity: "warning",
          audience: "dm",
          sourceParts: [territory.dmName, "velocity-down"],
          ...base,
        }),
      );
    }
  }

  if (ctx.coverage) {
    for (const row of ctx.coverage.opportunities.filter((o) => o.staffingRisk === "RED")) {
      const dmName = row.territoryOwner;
      const states = getAssignedStatesForDm(dmName);
      if (!matchesTerritory(states, ctx.territoryStates)) continue;
      const jobCandidates = ctx.candidates.filter(
        (c) => normalizeStateCode(c.state) === normalizeStateCode(row.state),
      );
      const hasRecentActivity = jobCandidates.some((c) => {
        const days = calendarDaysSince(c.appliedDate, Date.parse(ctx.fetchedAt));
        return days !== null && days <= OPEN_CALL_INACTIVITY_DAYS;
      });
      if (!hasRecentActivity) {
        notifications.push(
          makeNotification(ctx, {
            ruleId: "dm-open-calls-inactive",
            title: "Open call with no recruiter activity",
            message: `${row.projectName} in ${row.city}, ${row.state} needs recruiter engagement`,
            severity: "warning",
            audience: "dm",
            sourceParts: [dmName, row.opportunityId, "inactive"],
            dmName: dmName as NotificationRecord["dmName"],
            territoryStates: states,
            state: row.state,
            city: row.city,
          }),
        );
      }
    }
  }

  for (const job of ctx.jobs) {
    if (candidatesForJob(job, ctx.candidates).length > 0) continue;
    const state = normalizeStateCode(job.state);
    const dm = territoryRowForState(center, state);
    if (!dm) continue;
    if (!matchesTerritory(dm.states, ctx.territoryStates)) continue;
    notifications.push(
      makeNotification(ctx, {
        ruleId: "dm-zero-applicant-jobs",
        title: "Zero applicants",
        message: `No applicants for ${job.name} in ${job.city}, ${job.state}`,
        severity: "warning",
        audience: "dm",
        sourceParts: [dm.dmName, job.jobId, "job-zero"],
        dmName: dm.dmName,
        territoryStates: dm.states,
        state: job.state,
        city: job.city,
        jobId: job.jobId,
      }),
    );
  }

  return dedupeNotifications(notifications);
}

function territoryRowForState(
  center: ReturnType<typeof buildTerritoryIntelligenceCenter>,
  state: string,
) {
  return center.territories.find((row) =>
    row.states.map(normalizeStateCode).includes(normalizeStateCode(state)),
  );
}

function buildExecutiveNotifications(ctx: NotificationBuildContext): NotificationRecord[] {
  const center = buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  });

  const notifications: NotificationRecord[] = [];

  for (const territory of center.executiveRollup.highestRiskTerritories.slice(0, 10)) {
    if (!matchesTerritory(territory.states, ctx.territoryStates)) continue;
    notifications.push(
      makeNotification(ctx, {
        ruleId: "executive-critical-territory",
        title: "Critical territory",
        message: `${territory.dmName} attention score ${territory.attentionScore} · risk ${territory.metrics.coverageRiskScore}/100`,
        severity: territory.metrics.coverageRiskScore >= 80 ? "critical" : "warning",
        audience: "executive",
        sourceParts: [territory.dmName, "critical-territory"],
        dmName: territory.dmName,
        territoryStates: territory.states,
      }),
    );
  }

  for (const territory of center.territories) {
    if (territory.metrics.recruiterWorkloadScore >= RECRUITER_WORKLOAD_NOTIFICATION_THRESHOLD) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "executive-recruiter-workload",
          title: "High recruiter workload",
          message: `Recruiter workload ${territory.metrics.recruiterWorkloadScore}/100 in ${territory.dmName} territory`,
          severity: "warning",
          audience: "executive",
          sourceParts: [territory.dmName, "workload"],
          dmName: territory.dmName,
          territoryStates: territory.states,
        }),
      );
    }
  }

  const velocityDown = center.territories.filter(
    (row) => row.metrics.applicantVelocity.direction === "down" && row.metrics.applicantVelocity.delta <= -5,
  );
  if (velocityDown.length >= 2) {
    notifications.push(
      makeNotification(ctx, {
        ruleId: "executive-hiring-velocity-decline",
        title: "Hiring velocity declining",
        message: `${velocityDown.length} territories show declining applicant velocity`,
        severity: "warning",
        audience: "executive",
        sourceParts: ["org", "velocity-decline"],
        territoryStates: [],
      }),
    );
  }

  if (ctx.coverage) {
    const atRisk = ctx.coverage.opportunities.filter(
      (row) => row.staffingRisk === "RED" && row.priority.toLowerCase() === "high",
    );
    if (atRisk.length > 0) {
      notifications.push(
        makeNotification(ctx, {
          ruleId: "executive-open-calls-at-risk",
          title: "Open calls at risk",
          message: `${atRisk.length} high-priority open call(s) at staffing risk`,
          severity: atRisk.length >= 5 ? "critical" : "warning",
          audience: "executive",
          sourceParts: ["org", "open-calls-risk", String(atRisk.length)],
          territoryStates: [],
        }),
      );
    }
  }

  return dedupeNotifications(notifications);
}

function dedupeNotifications(notifications: NotificationRecord[]): NotificationRecord[] {
  const byKey = new Map<string, NotificationRecord>();
  for (const row of notifications) {
    byKey.set(row.sourceKey, row);
  }
  return [...byKey.values()];
}

export function buildGeneratedNotifications(ctx: NotificationBuildContext): NotificationRecord[] {
  return dedupeNotifications([
    ...buildRecruiterNotifications(ctx),
    ...buildDmNotifications(ctx),
    ...buildExecutiveNotifications(ctx),
  ]).sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function applyNotificationOverlays(
  notifications: NotificationRecord[],
  overlays: NotificationStoreOverlay[],
  userId: string,
): NotificationRecord[] {
  const overlayByKey = new Map(
    overlays.filter((row) => row.userId === userId).map((row) => [row.sourceKey, row]),
  );

  return notifications.map((notification) => {
    const overlay = overlayByKey.get(notification.sourceKey);
    if (!overlay) return notification;
    return {
      ...notification,
      status: overlay.status,
      readAt: overlay.readAt,
      dismissedAt: overlay.dismissedAt,
      resolvedAt: overlay.resolvedAt,
      updatedAt: overlay.updatedAt,
      auditHistory: [...notification.auditHistory, ...overlay.auditHistory],
    };
  });
}

export function filterNotificationsForSession(
  notifications: NotificationRecord[],
  session: AuthSession,
  filters?: {
    recruiter?: string | null;
    territoryStates?: string[] | null;
    severity?: NotificationSeverity | null;
    unreadOnly?: boolean;
    includeDismissed?: boolean;
  },
): NotificationRecord[] {
  const role = session.role;
  let scoped = notifications;

  if (role === "recruiter") {
    scoped = scoped.filter((row) => row.audience === "recruiter");
  } else if (role === "dm") {
    scoped = scoped.filter((row) => row.audience === "dm" || row.audience === "recruiter");
    if (session.territoryStates.length > 0) {
      const allowed = new Set(session.territoryStates.map(normalizeStateCode));
      scoped = scoped.filter((row) =>
        row.territoryStates.length === 0 ||
        row.territoryStates.some((state) => allowed.has(normalizeStateCode(state))),
      );
    }
  } else if (role === "executive") {
    scoped = scoped.filter((row) => row.audience === "executive" || row.audience === "dm");
  }

  if (filters?.recruiter?.trim()) {
    const recruiter = filters.recruiter.trim();
    scoped = scoped.filter((row) => row.recruiterName === recruiter);
  }

  if (filters?.territoryStates && filters.territoryStates.length > 0) {
    const allowed = new Set(filters.territoryStates.map(normalizeStateCode));
    scoped = scoped.filter((row) =>
      row.territoryStates.length === 0 ||
      row.territoryStates.some((state) => allowed.has(normalizeStateCode(state))),
    );
  }

  if (filters?.severity) {
    scoped = scoped.filter((row) => row.severity === filters.severity);
  }

  if (filters?.unreadOnly) {
    scoped = scoped.filter((row) => row.status === "active");
  }

  if (!filters?.includeDismissed) {
    scoped = scoped.filter((row) => row.status !== "dismissed");
  }

  return scoped;
}

export function buildNotificationMetrics(
  notifications: NotificationRecord[],
  overlays: NotificationStoreOverlay[],
): NotificationMetrics {
  const resolvedOverlays = overlays.filter((row) => row.status === "resolved" && row.resolvedAt);
  const resolutionHours = resolvedOverlays
    .map((row) => {
      const created = Date.parse(row.updatedAt);
      const resolved = row.resolvedAt ? Date.parse(row.resolvedAt) : NaN;
      if (Number.isNaN(created) || Number.isNaN(resolved)) return null;
      return Math.max(0, (resolved - created) / (60 * 60 * 1000));
    })
    .filter((value): value is number => value !== null);

  return {
    alertsGenerated: notifications.length,
    alertsResolved: resolvedOverlays.length,
    activeCriticalAlerts: notifications.filter(
      (row) => row.severity === "critical" && row.status === "active",
    ).length,
    avgResolutionTimeHours:
      resolutionHours.length > 0
        ? Math.round(
            (resolutionHours.reduce((sum, hours) => sum + hours, 0) / resolutionHours.length) * 10,
          ) / 10
        : null,
    unreadCount: notifications.filter((row) => row.status === "active").length,
  };
}

export function buildNotificationCenterSnapshot(
  ctx: NotificationBuildContext,
  session: AuthSession,
  overlays: NotificationStoreOverlay[],
  filters?: {
    recruiter?: string | null;
    territoryStates?: string[] | null;
    severity?: NotificationSeverity | null;
    unreadOnly?: boolean;
    includeDismissed?: boolean;
  },
): NotificationCenterSnapshot {
  const generated = buildGeneratedNotifications({
    ...ctx,
    territoryStates: filters?.territoryStates ?? ctx.territoryStates,
  });
  const merged = applyNotificationOverlays(generated, overlays, session.userId);
  const notifications = filterNotificationsForSession(merged, session, filters);

  const recruiters = [
    ...new Set(
      merged
        .map((row) => row.recruiterName)
        .filter((name): name is string => Boolean(name?.trim())),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const territoryStates = [
    ...new Set(merged.flatMap((row) => row.territoryStates)),
  ].sort((a, b) => a.localeCompare(b));

  return {
    fetchedAt: ctx.fetchedAt,
    notifications,
    metrics: buildNotificationMetrics(merged, overlays),
    rules: AUTOMATION_RULES,
    filterOptions: {
      recruiters,
      territoryStates,
      severities: ["critical", "warning", "info"],
    },
  };
}

export function listCriticalNotifications(
  snapshot: NotificationCenterSnapshot,
  limit = 5,
): NotificationRecord[] {
  return snapshot.notifications
    .filter((row) => row.severity === "critical" && row.status === "active")
    .slice(0, limit);
}
