import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";
import { buildDmPortalOperationalView } from "@/lib/dm-portal/dm-portal-operational";
import { normalizeStateCode } from "@/lib/dm-territory-map";

export const DM_COMMAND_CENTER_SECTION_IDS = {
  home: "dm-command-home",
  priorityQueue: "dm-priority-queue",
  territoryMap: "dm-territory-map",
  repUtilization: "dm-rep-utilization",
  projectStaffing: "dm-project-staffing",
  escalationCenter: "dm-escalation-center",
  actions: "dm-command-actions",
} as const;

export type DmCommandCenterRiskLevel = "low" | "medium" | "high" | "critical";

export type DmCommandCenterKpi = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type DmTerritoryPriorityItem = {
  id: string;
  category: "coverage" | "applicants" | "staffing" | "project";
  categoryLabel: string;
  title: string;
  detail: string;
  impactScore: number;
  priority: DmPrioritizedAlert["priority"];
  recommendedAction: string;
  alertId?: string;
  jobId?: string;
  state?: string;
};

export type DmTerritoryMapStateRow = {
  state: string;
  coveragePercent: number;
  openCalls: number;
  repCount: number;
  openJobs: number;
  riskLevel: DmCommandCenterRiskLevel;
};

export type DmRepUtilizationBucket = {
  id: string;
  label: string;
  count: number;
  hint: string;
  tone: "ok" | "warn" | "neutral";
};

export type DmProjectStaffingRow = {
  id: string;
  projectName: string;
  client: string;
  location: string;
  openCalls: number;
  filledCalls: number;
  coveragePercent: number;
  riskLevel: DmCommandCenterRiskLevel;
};

export type DmEscalationCenterItem = {
  id: string;
  source: "recruiter" | "coverage" | "project";
  sourceLabel: string;
  title: string;
  detail: string;
  impactScore: number;
  recommendedAction: string;
  alertId?: string;
  jobId?: string;
};

export type DmCommandCenterSnapshot = {
  dmName: string;
  territoryLabel: string;
  territoryStates: string[];
  fetchedAt: string;
  kpis: DmCommandCenterKpi[];
  priorityQueue: DmTerritoryPriorityItem[];
  territoryMap: {
    placeholder: true;
    version: number;
    cellsPrepared: number;
    states: DmTerritoryMapStateRow[];
  };
  repUtilization: DmRepUtilizationBucket[];
  projectStaffing: DmProjectStaffingRow[];
  escalationCenter: DmEscalationCenterItem[];
};

const PRIORITY_QUEUE_LIMIT = 12;
const PROJECT_STAFFING_LIMIT = 10;
const ESCALATION_LIMIT = 15;

function riskFromCoverage(percent: number): DmCommandCenterRiskLevel {
  if (percent < 20) return "critical";
  if (percent < 50) return "high";
  if (percent < 80) return "medium";
  return "low";
}

function priorityCategory(alert: DmPrioritizedAlert): DmTerritoryPriorityItem["category"] {
  if (alert.category.includes("job-aging") || alert.category === "no-applicants-7d") {
    return "applicants";
  }
  if (alert.category === "low-applicant-flow-city" || alert.state) {
    return "coverage";
  }
  return "staffing";
}

function priorityCategoryLabel(category: DmTerritoryPriorityItem["category"]): string {
  switch (category) {
    case "coverage":
      return "Coverage risk";
    case "applicants":
      return "Applicant drought";
    case "staffing":
      return "Staffing gap";
    case "project":
      return "Project risk";
  }
}

function mapAlertToPriorityItem(alert: DmPrioritizedAlert): DmTerritoryPriorityItem {
  const category = priorityCategory(alert);
  return {
    id: alert.id,
    category,
    categoryLabel: priorityCategoryLabel(category),
    title: alert.title,
    detail: alert.detail,
    impactScore: alert.priorityScore,
    priority: alert.priority,
    recommendedAction: alert.recommendedAction,
    alertId: alert.id,
    jobId: alert.jobId,
    state: alert.state,
  };
}

function buildSyntheticPriorityItems(snapshot: DmDashboardSnapshot): DmTerritoryPriorityItem[] {
  const operational = buildDmPortalOperationalView(snapshot);
  const items: DmTerritoryPriorityItem[] = [];

  if (operational.territory.coveragePercent < 20) {
    items.push({
      id: "synthetic-coverage-low",
      category: "coverage",
      categoryLabel: "Coverage risk",
      title: `Territory coverage below 20% (${operational.territory.coveragePercent}%)`,
      detail: `${snapshot.dmName} · ${snapshot.territoryLabel}`,
      impactScore: 420,
      priority: "critical",
      recommendedAction: "Review open calls and rep assignments in at-risk states.",
    });
  }

  const noApplicants14d = snapshot.prioritizedAlerts.filter(
    (alert) =>
      alert.category.includes("job-aging") &&
      alert.ageDays >= 14 &&
      (alert.category === "no-applicants-7d" || alert.detail.toLowerCase().includes("applicant")),
  );
  if (noApplicants14d.length === 0) {
    const aging14 = snapshot.prioritizedAlerts.find(
      (alert) => alert.category.includes("job-aging") && alert.ageDays >= 14,
    );
    if (aging14) {
      items.push(mapAlertToPriorityItem(aging14));
    }
  }

  if (operational.territory.activeReps === 0) {
    items.push({
      id: "synthetic-no-reps",
      category: "staffing",
      categoryLabel: "Staffing gap",
      title: "No active reps assigned in territory",
      detail: snapshot.territoryLabel,
      impactScore: 380,
      priority: "critical",
      recommendedAction: "Escalate recruiter assignment and review rep pool.",
    });
  }

  for (const store of snapshot.melMatching.unstaffedHighPriorityStores.slice(0, 3)) {
    items.push({
      id: `project-risk-${store.projectName}-${store.state}`,
      category: "project",
      categoryLabel: "Project risk",
      title: `High-value project at risk: ${store.projectName}`,
      detail: `${store.client} · ${store.storeName} · ${store.state}`,
      impactScore: 340,
      priority: "high",
      recommendedAction: "Staff project and confirm rep coverage.",
      state: store.state,
    });
  }

  return items;
}

function buildTerritoryMapRows(snapshot: DmDashboardSnapshot): DmTerritoryMapStateRow[] {
  const operational = buildDmPortalOperationalView(snapshot);
  const repPerState = Math.max(
    1,
    Math.round(operational.territory.activeReps / Math.max(1, snapshot.territoryStates.length)),
  );
  const callsPerState = Math.max(
    0,
    Math.round(operational.territory.openCalls / Math.max(1, snapshot.territoryStates.length)),
  );

  const stateRows = snapshot.territoryStates.map((state) => {
    const code = normalizeStateCode(state) || state;
    const stateOps = snapshot.operationalIndex.statesByCode[code];
    const openJobs = stateOps?.openJobs ?? Math.round(snapshot.activeJobs / Math.max(1, snapshot.territoryStates.length));
    const alertPenalty = (stateOps?.alertCount ?? 0) * 8;
    const coveragePercent = Math.max(0, Math.min(100, operational.territory.coveragePercent - alertPenalty));
    return {
      state: code,
      coveragePercent,
      openCalls: callsPerState + (stateOps?.alertCount ?? 0),
      repCount: repPerState,
      openJobs,
      riskLevel: riskFromCoverage(coveragePercent),
    };
  });

  if (stateRows.length > 0) return stateRows;

  const byState = new Map<string, DmTerritoryMapStateRow>();
  for (const cell of snapshot.heatmap.cells) {
    const state = normalizeStateCode(cell.state) || cell.state;
    const existing = byState.get(state);
    const coveragePercent = Math.max(0, Math.min(100, cell.healthScore));
    if (!existing) {
      byState.set(state, {
        state,
        coveragePercent,
        openCalls: cell.jobCount,
        repCount: Math.max(0, cell.candidateCount),
        openJobs: cell.jobCount,
        riskLevel: riskFromCoverage(coveragePercent),
      });
      continue;
    }
    existing.openCalls += cell.jobCount;
    existing.openJobs += cell.jobCount;
    existing.repCount += cell.candidateCount;
    existing.coveragePercent = Math.round((existing.coveragePercent + coveragePercent) / 2);
    existing.riskLevel = riskFromCoverage(existing.coveragePercent);
  }

  return [...byState.values()].sort((a, b) => a.state.localeCompare(b.state));
}

function buildRepUtilization(snapshot: DmDashboardSnapshot): DmRepUtilizationBucket[] {
  const operational = buildDmPortalOperationalView(snapshot);
  const active = operational.territory.activeReps;
  const recentlyActive =
    snapshot.pipeline.counts.interviewing +
    snapshot.onboarding.paperworkSigned +
    snapshot.onboarding.ddRequested;
  const inactive = Math.max(0, snapshot.pipeline.counts.stalled);
  const projectsAssigned = snapshot.melMatching.bestCandidateForOpenProjects.length;

  return [
    {
      id: "active",
      label: "Active reps",
      count: active,
      hint: "Onboarded and available for assignment",
      tone: "ok",
    },
    {
      id: "recent",
      label: "Recently active",
      count: recentlyActive,
      hint: "Interviewing or in onboarding steps",
      tone: "neutral",
    },
    {
      id: "inactive",
      label: "Inactive reps",
      count: inactive,
      hint: "Stalled pipeline — needs follow-up",
      tone: inactive > 0 ? "warn" : "neutral",
    },
    {
      id: "projects",
      label: "Projects assigned",
      count: projectsAssigned,
      hint: "Reps matched to open MEL projects",
      tone: "ok",
    },
  ];
}

function buildProjectStaffingRows(snapshot: DmDashboardSnapshot): DmProjectStaffingRow[] {
  const rows: DmProjectStaffingRow[] = [];

  for (const store of snapshot.melMatching.unstaffedHighPriorityStores) {
    const match = snapshot.melMatching.bestCandidateForOpenProjects.find(
      (row) => row.projectName === store.projectName,
    );
    const filledCalls = match ? 1 : 0;
    const openCalls = 1;
    const coveragePercent = filledCalls > 0 ? 100 : 0;
    rows.push({
      id: `mel-${store.projectName}-${store.state}`,
      projectName: store.projectName,
      client: store.client,
      location: `${store.storeName} · ${store.state}`,
      openCalls,
      filledCalls,
      coveragePercent,
      riskLevel: filledCalls > 0 ? "medium" : "critical",
    });
  }

  const jobs = Object.values(snapshot.operationalIndex.jobsById)
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
    .slice(0, PROJECT_STAFFING_LIMIT);

  for (const job of jobs) {
    if (rows.length >= PROJECT_STAFFING_LIMIT) break;
    const filledCalls = job.interviewingCount + (job.candidateCounts?.hired ?? 0);
    const openCalls = Math.max(1, job.applicantCount > 0 ? 1 : 1);
    const coveragePercent =
      job.applicantCount > 0
        ? Math.min(100, Math.round((filledCalls / Math.max(job.applicantCount, 1)) * 100))
        : 0;
    rows.push({
      id: `job-${job.jobId}`,
      projectName: job.title,
      client: "Breezy role",
      location: `${job.city}, ${job.state}`,
      openCalls,
      filledCalls,
      coveragePercent,
      riskLevel: riskFromCoverage(coveragePercent),
    });
  }

  return rows
    .sort(
      (a, b) =>
        riskRank(b.riskLevel) - riskRank(a.riskLevel) ||
        a.coveragePercent - b.coveragePercent,
    )
    .slice(0, PROJECT_STAFFING_LIMIT);
}

function riskRank(level: DmCommandCenterRiskLevel): number {
  switch (level) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function buildEscalationCenter(snapshot: DmDashboardSnapshot): DmEscalationCenterItem[] {
  const items: DmEscalationCenterItem[] = [];

  for (const alert of snapshot.prioritizedAlerts.slice(0, 8)) {
    items.push({
      id: `alert-${alert.id}`,
      source: alert.jobId ? "recruiter" : "coverage",
      sourceLabel: alert.jobId ? "Recruiter escalation" : "Coverage risk",
      title: alert.title,
      detail: alert.detail,
      impactScore: alert.priorityScore,
      recommendedAction: alert.recommendedAction,
      alertId: alert.id,
      jobId: alert.jobId,
    });
  }

  for (const bar of snapshot.coverage.topProblemCities.slice(0, 4)) {
    items.push({
      id: `coverage-${bar.label}`,
      source: "coverage",
      sourceLabel: "Coverage risk",
      title: `Coverage pressure: ${bar.label}`,
      detail: `Problem score ${bar.value} in territory`,
      impactScore: 200 + bar.value * 10,
      recommendedAction: "Review city demand and rep placement.",
    });
  }

  for (const store of snapshot.melMatching.unstaffedHighPriorityStores.slice(0, 4)) {
    items.push({
      id: `project-${store.projectName}-${store.state}`,
      source: "project",
      sourceLabel: "Project risk",
      title: `Unstaffed: ${store.projectName}`,
      detail: `${store.client} · ${store.storeName}`,
      impactScore: 260,
      recommendedAction: "Confirm staffing plan and recruiter support.",
    });
  }

  return items
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, ESCALATION_LIMIT);
}

export function buildDmCommandCenterSnapshot(snapshot: DmDashboardSnapshot): DmCommandCenterSnapshot {
  const operational = buildDmPortalOperationalView(snapshot);
  const projectsActive =
    snapshot.melMatching.unstaffedHighPriorityStores.length +
    snapshot.melMatching.bestCandidateForOpenProjects.length;

  const kpis: DmCommandCenterKpi[] = [
    {
      id: "coverage",
      label: "Coverage %",
      value: `${operational.territory.coveragePercent}%`,
      hint: operational.territory.coverageTier,
    },
    {
      id: "open-calls",
      label: "Open calls",
      value: operational.territory.openCalls.toLocaleString(),
    },
    {
      id: "active-reps",
      label: "Active reps",
      value: operational.territory.activeReps.toLocaleString(),
    },
    {
      id: "projects-active",
      label: "Projects active",
      value: projectsActive.toLocaleString(),
      hint: "Open MEL demand + matched projects",
    },
    {
      id: "health-score",
      label: "Territory health score",
      value: String(snapshot.health.score),
      hint: snapshot.health.label,
    },
  ];

  const fromAlerts = snapshot.prioritizedAlerts.map(mapAlertToPriorityItem);
  const synthetic = buildSyntheticPriorityItems(snapshot);
  const merged = new Map<string, DmTerritoryPriorityItem>();
  for (const item of [...synthetic, ...fromAlerts]) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }
  const priorityQueue = [...merged.values()]
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, PRIORITY_QUEUE_LIMIT);

  return {
    dmName: snapshot.dmName,
    territoryLabel: snapshot.territoryLabel,
    territoryStates: snapshot.territoryStates,
    fetchedAt: snapshot.fetchedAt,
    kpis,
    priorityQueue,
    territoryMap: {
      placeholder: true,
      version: snapshot.heatmap.version,
      cellsPrepared: snapshot.heatmap.meta.cellCount,
      states: buildTerritoryMapRows(snapshot),
    },
    repUtilization: buildRepUtilization(snapshot),
    projectStaffing: buildProjectStaffingRows(snapshot),
    escalationCenter: buildEscalationCenter(snapshot),
  };
}
