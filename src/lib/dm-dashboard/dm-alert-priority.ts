import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { DmAttentionCategory, DmAttentionItem } from "@/lib/dm-dashboard/dm-needs-attention";
import {
  MS_PER_DAY,
  candidatesForJob,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

export type DmAlertPriority = "critical" | "high" | "medium" | "low";

export type DmPrioritizedAlert = DmAttentionItem & {
  priority: DmAlertPriority;
  priorityScore: number;
  recommendedAction: string;
  /** Job age or days since last applicant — used for sorting oldest-first. */
  ageDays: number;
  alertTypeLabel: string;
};

export type DmAlertOperationsSummary = {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  agingJobsCount: number;
  zeroApplicantJobsCount: number;
  territoryRecruitingRiskScore: number;
};

export type DmAlertSortMode = "highest-risk" | "oldest";
export type DmAlertPriorityFilter = DmAlertPriority | "all";

type JobSignalContext = {
  jobAgeDays: number | null;
  daysSinceLastApplicant: number | null;
  applicants7d: number;
  applicants14d: number;
  totalApplicants: number;
};

const PRIORITY_RANK: Record<DmAlertPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const CATEGORY_LABELS: Record<DmAttentionCategory, string> = {
  "no-applicants-7d": "No recent applicants",
  "no-interviews": "No interviews",
  "job-aging": "Job aging",
  "job-aging-14": "Job aging (14d+)",
  "job-aging-21": "Job aging (21d+)",
  "job-aging-30": "Job aging (30d+)",
  "low-applicant-flow": "Low applicant flow",
  "low-applicant-flow-city": "City applicant drought",
  "low-interview-conversion": "Low interview conversion",
};

function priorityBaseScore(priority: DmAlertPriority): number {
  return PRIORITY_RANK[priority] * 100;
}

function buildJobSignalMap(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  reference: Date,
): Map<string, JobSignalContext> {
  const since7d = new Date(reference.getTime() - 7 * MS_PER_DAY);
  const since14d = new Date(reference.getTime() - 14 * MS_PER_DAY);
  const map = new Map<string, JobSignalContext>();

  for (const job of jobs) {
    const jobCandidates = candidatesForJob(job, candidates);
    let lastApplicant: Date | null = null;
    let applicants7d = 0;
    let applicants14d = 0;

    for (const candidate of jobCandidates) {
      const applied = parseDate(candidate.appliedDate);
      if (!applied) continue;
      if (!lastApplicant || applied > lastApplicant) lastApplicant = applied;
      if (applied >= since7d) applicants7d += 1;
      if (applied >= since14d) applicants14d += 1;
    }

    const created = parseDate(job.createdDate || job.updatedDate);
    const jobAgeDays =
      created !== null
        ? Math.max(0, Math.round((reference.getTime() - created.getTime()) / MS_PER_DAY))
        : null;

    const daysSinceLastApplicant =
      lastApplicant !== null
        ? Math.max(0, Math.round((reference.getTime() - lastApplicant.getTime()) / MS_PER_DAY))
        : jobCandidates.length === 0 && jobAgeDays !== null
          ? jobAgeDays
          : null;

    map.set(job.jobId, {
      jobAgeDays,
      daysSinceLastApplicant,
      applicants7d,
      applicants14d,
      totalApplicants: jobCandidates.length,
    });
  }

  return map;
}

function dedupeAlerts(items: DmAttentionItem[]): DmAttentionItem[] {
  const byId = new Map<string, DmAttentionItem>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    if (existing.severity === "warning" && item.severity === "critical") {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function resolveNoApplicantPriority(ctx: JobSignalContext | null): {
  priority: DmAlertPriority;
  recommendedAction: string;
} {
  const droughtDays = ctx?.daysSinceLastApplicant ?? ctx?.jobAgeDays ?? 0;
  if (droughtDays >= 14 || (ctx && ctx.applicants14d === 0 && ctx.totalApplicants === 0)) {
    return { priority: "critical", recommendedAction: "Increase pay range" };
  }
  if (droughtDays >= 7 || (ctx && ctx.applicants7d === 0)) {
    return { priority: "high", recommendedAction: "Repost in nearby metro" };
  }
  return { priority: "medium", recommendedAction: "Recruiter follow-up recommended" };
}

function resolveAgingPriority(
  category: DmAttentionCategory,
  jobAgeDays: number | null,
): { priority: DmAlertPriority; recommendedAction: string } {
  const age = jobAgeDays ?? 0;
  if (category === "job-aging-30" || age >= 30) {
    return { priority: "high", recommendedAction: "Escalate to recruiting" };
  }
  if (category === "job-aging-21" || (age >= 21 && age < 30)) {
    return { priority: "medium", recommendedAction: "Add secondary city targeting" };
  }
  if (category === "job-aging-14" || category === "job-aging" || (age >= 14 && age < 21)) {
    return { priority: "medium", recommendedAction: "Repost in nearby metro" };
  }
  return { priority: "low", recommendedAction: "Monitor job performance" };
}

function assignPriority(
  item: DmAttentionItem,
  ctx: JobSignalContext | null,
): Pick<DmPrioritizedAlert, "priority" | "priorityScore" | "recommendedAction" | "ageDays"> {
  const jobAge = ctx?.jobAgeDays ?? 0;
  const droughtDays = ctx?.daysSinceLastApplicant ?? jobAge;

  let priority: DmAlertPriority = "low";
  let recommendedAction = "Monitor job performance";

  switch (item.category) {
    case "no-applicants-7d": {
      const resolved = resolveNoApplicantPriority(ctx);
      priority = resolved.priority;
      recommendedAction = resolved.recommendedAction;
      break;
    }
    case "no-interviews":
      priority = (ctx?.totalApplicants ?? 0) >= 3 ? "high" : "medium";
      recommendedAction = "Recruiter follow-up recommended";
      break;
    case "job-aging":
    case "job-aging-14":
    case "job-aging-21":
    case "job-aging-30": {
      const resolved = resolveAgingPriority(item.category, ctx?.jobAgeDays ?? jobAge);
      priority = resolved.priority;
      recommendedAction = resolved.recommendedAction;
      break;
    }
    case "low-applicant-flow":
      priority = (ctx?.totalApplicants ?? 0) <= 1 ? "medium" : "low";
      recommendedAction =
        (ctx?.totalApplicants ?? 0) <= 1 ? "Expand city radius" : "Recruiter follow-up recommended";
      break;
    case "low-applicant-flow-city":
      priority = "high";
      recommendedAction = "Add secondary city targeting";
      break;
    case "low-interview-conversion":
      priority = "low";
      recommendedAction = "Consider route assignment";
      break;
    default:
      priority = item.severity === "critical" ? "high" : "low";
      recommendedAction = "Escalate to recruiting";
  }

  if (item.severity === "critical" && priority === "low") {
    priority = "medium";
  }

  const ageDays = Math.max(droughtDays, jobAge, 0);
  const priorityScore = priorityBaseScore(priority) + Math.min(ageDays, 99);

  return { priority, priorityScore, recommendedAction, ageDays };
}

export function prioritizeTerritoryAlert(
  item: DmAttentionItem,
  jobSignals: Map<string, JobSignalContext>,
): DmPrioritizedAlert {
  const ctx = item.jobId ? jobSignals.get(item.jobId) ?? null : null;
  const scored = assignPriority(item, ctx);
  return {
    ...item,
    ...scored,
    alertTypeLabel: CATEGORY_LABELS[item.category] ?? item.category,
  };
}

export function buildPrioritizedTerritoryAlerts(
  rawItems: DmAttentionItem[],
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
  options?: { healthScore?: number },
): { alerts: DmPrioritizedAlert[]; summary: DmAlertOperationsSummary } {
  const reference = new Date(referenceIso);
  const jobSignals = buildJobSignalMap(jobs, candidates, reference);
  const deduped = dedupeAlerts(rawItems);

  const alerts = deduped
    .map((item) => prioritizeTerritoryAlert(item, jobSignals))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.ageDays - a.ageDays);

  const summary = buildAlertOperationsSummary(alerts, jobs, jobSignals, options?.healthScore ?? 50);
  return { alerts, summary };
}

export function buildAlertOperationsSummary(
  alerts: DmPrioritizedAlert[],
  jobs: BreezyJob[],
  jobSignals: Map<string, JobSignalContext>,
  healthScore: number,
): DmAlertOperationsSummary {
  const criticalCount = alerts.filter((a) => a.priority === "critical").length;
  const highCount = alerts.filter((a) => a.priority === "high").length;
  const mediumCount = alerts.filter((a) => a.priority === "medium").length;
  const lowCount = alerts.filter((a) => a.priority === "low").length;

  let agingJobsCount = 0;
  let zeroApplicantJobsCount = 0;
  for (const job of jobs) {
    const ctx = jobSignals.get(job.jobId);
    if (!ctx) continue;
    if ((ctx.jobAgeDays ?? 0) >= 30) agingJobsCount += 1;
    if (ctx.applicants7d === 0) zeroApplicantJobsCount += 1;
  }

  const weightedBurden = alerts.reduce((sum, alert) => {
    if (alert.priority === "critical") return sum + 12;
    if (alert.priority === "high") return sum + 8;
    if (alert.priority === "medium") return sum + 4;
    return sum + 1;
  }, 0);

  const alertPressure = Math.min(100, weightedBurden * 2);
  const territoryRecruitingRiskScore = Math.round(
    Math.min(100, Math.max(0, alertPressure * 0.65 + (100 - healthScore) * 0.35)),
  );

  return {
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    agingJobsCount,
    zeroApplicantJobsCount,
    territoryRecruitingRiskScore,
  };
}

export function filterPrioritizedAlerts(
  alerts: DmPrioritizedAlert[],
  options: {
    priority?: DmAlertPriorityFilter;
    category?: DmAttentionCategory | "all";
  },
): DmPrioritizedAlert[] {
  return alerts.filter((alert) => {
    if (options.priority && options.priority !== "all" && alert.priority !== options.priority) {
      return false;
    }
    if (options.category && options.category !== "all" && alert.category !== options.category) {
      return false;
    }
    return true;
  });
}

export function sortPrioritizedAlerts(
  alerts: DmPrioritizedAlert[],
  mode: DmAlertSortMode,
): DmPrioritizedAlert[] {
  const copy = [...alerts];
  if (mode === "oldest") {
    return copy.sort((a, b) => b.ageDays - a.ageDays || b.priorityScore - a.priorityScore);
  }
  return copy.sort((a, b) => b.priorityScore - a.priorityScore || b.ageDays - a.ageDays);
}

export function mergeTerritoryAlertSources(
  fillRisk: DmAttentionItem[],
  needsAttention: DmAttentionItem[],
): DmAttentionItem[] {
  return dedupeAlerts([...fillRisk, ...needsAttention]);
}
