import type { SheetRow } from "@/lib/google-sheet-csv";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import {
  isCompletedStoreCallStatus,
  resolveMelProjectColumnKeys,
} from "@/lib/mel-projects-metrics";
import { parseApplicantCount, parseCreatedDate } from "@/lib/post-automation";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";
import type { ChartBar } from "@/lib/recruiting-intelligence";
import { normalizeState, resolveMarketIdentity } from "@/lib/market-identity";

export type MarketUrgency = "Critical" | "High" | "Moderate" | "Stable";

export type DemandRecommendation =
  | "Increase posting volume"
  | "Expand recruiting radius"
  | "Reassign reps"
  | "Escalate to recruiting";

export type ComparisonBar = {
  label: string;
  primary: number;
  secondary: number;
};

export type MarketDemandRow = {
  market: string;
  stateCode: string;
  demandScore: number;
  urgency: MarketUrgency;
  openStoreCalls: number;
  activeReps: number;
  completionPercent: number | null;
  nearestDeadlineDays: number | null;
  applicants: number;
  openPositions: number;
  recommendations: DemandRecommendation[];
};

export type ProjectStaffingRiskRow = {
  projectNo: string;
  projectName: string;
  manager: string;
  state: string;
  openStoreCalls: number;
  activeReps: number;
  completionPercent: number | null;
  nearestDeadlineDays: number | null;
  applicants: number;
  riskScore: number;
  urgency: MarketUrgency;
  recommendations: DemandRecommendation[];
};

export type DmStaffingGapRow = {
  manager: string;
  openStoreCalls: number;
  activeReps: number;
  staffingGap: number;
  openPositions: number;
  applicants: number;
  completionPercent: number | null;
  recommendations: DemandRecommendation[];
};

export type DemandIntelligenceSnapshot = {
  markets: MarketDemandRow[];
  projectsAtRisk: ProjectStaffingRiskRow[];
  dmGaps: DmStaffingGapRow[];
  storeCallsVsApplicants: ComparisonBar[];
  activeRepsVsOpenCalls: ComparisonBar[];
  completionByProject: ChartBar[];
  columnHint: string;
};

const END_DATE_ALIASES = ["end date", "due date", "project end", "deadline"];
const TABLE_LIMIT = 25;
const CHART_LIMIT = 10;

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }
  for (const alias of aliases) {
    const direct = set.get(normHeader(alias));
    if (direct) return direct;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n === a || n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function normalizeStateKey(raw: string): string {
  return normalizeState(raw);
}

function isAssignedRep(staffName: string): boolean {
  const name = staffName.trim().toLowerCase();
  return Boolean(name && name !== "open" && name !== "—");
}

function daysUntil(date: Date, from = new Date()): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function deadlinePressureScore(nearestDeadlineDays: number | null): number {
  if (nearestDeadlineDays === null) return 0;
  if (nearestDeadlineDays < 0) return 20;
  if (nearestDeadlineDays <= 7) return 18;
  if (nearestDeadlineDays <= 14) return 12;
  if (nearestDeadlineDays <= 30) return 6;
  return 0;
}

export function computeMarketUrgency(score: number): MarketUrgency {
  if (score >= 75) return "Critical";
  if (score >= 55) return "High";
  if (score >= 35) return "Moderate";
  return "Stable";
}

function computeDemandScore(input: {
  openStoreCalls: number;
  activeReps: number;
  completionPercent: number | null;
  nearestDeadlineDays: number | null;
  applicants: number;
  openPositions: number;
}): number {
  let score = 0;

  score += Math.min(25, input.openStoreCalls * 0.35);

  const callsPerRep = input.openStoreCalls / Math.max(input.activeReps, 1);
  score += Math.min(20, callsPerRep * 3.5);

  if (input.completionPercent !== null) {
    score += Math.min(15, (100 - input.completionPercent) * 0.15);
  }

  score += deadlinePressureScore(input.nearestDeadlineDays);

  if (input.openPositions > 0 && input.applicants === 0) {
    score += 18;
  } else if (input.openPositions > 0) {
    score += Math.min(12, input.openPositions * 1.5);
  }

  const supplyGap = Math.max(0, input.openStoreCalls - input.applicants);
  score += Math.min(12, supplyGap * 0.4);

  return Math.min(100, Math.round(score));
}

function buildRecommendations(input: {
  urgency: MarketUrgency;
  openStoreCalls: number;
  activeReps: number;
  applicants: number;
  openPositions: number;
  nearestDeadlineDays: number | null;
}): DemandRecommendation[] {
  const recs = new Set<DemandRecommendation>();
  const callsPerRep = input.openStoreCalls / Math.max(input.activeReps, 1);

  if (input.openPositions > 0 && input.applicants / Math.max(input.openPositions, 1) < 1) {
    recs.add("Increase posting volume");
  }

  if (input.openStoreCalls >= 5 && input.applicants < input.openStoreCalls * 0.25) {
    recs.add("Expand recruiting radius");
  }

  if (callsPerRep > 3.5 && input.activeReps < input.openStoreCalls) {
    recs.add("Reassign reps");
  }

  if (
    input.urgency === "Critical" ||
    (input.openPositions >= 2 && input.applicants === 0) ||
    (input.nearestDeadlineDays !== null && input.nearestDeadlineDays <= 7 && input.openStoreCalls > 0)
  ) {
    recs.add("Escalate to recruiting");
  }

  return [...recs];
}

type MelAgg = {
  openStoreCalls: number;
  totalCalls: number;
  completedCalls: number;
  activeReps: Set<string>;
  deadlineDays: number[];
};

type RecruitingAgg = {
  openPositions: number;
  applicants: number;
};

type ProjectAgg = MelAgg & {
  projectNo: string;
  projectName: string;
  manager: string;
  state: string;
};

type DmAgg = MelAgg & {
  states: Set<string>;
};

export function computeDemandIntelligence(
  recruitingRows: SheetRow[],
  recruitingHeaders: string[],
  melRows: MelProjectRow[],
  melHeaders: string[],
): DemandIntelligenceSnapshot {
  const recKeys = resolveKpiSheetColumnKeys(recruitingHeaders);
  const melKeys = resolveMelProjectColumnKeys(melHeaders);
  const endDateKey = pickColumn(melHeaders, END_DATE_ALIASES);

  const recruitingByState = new Map<string, RecruitingAgg>();
  const melByState = new Map<string, MelAgg>();
  const projects = new Map<string, ProjectAgg>();
  const dms = new Map<string, DmAgg>();

  if (recKeys.status && recKeys.applicantCount && recKeys.state) {
    for (const row of recruitingRows) {
      if (!isOpenPostStatus(cell(row, recKeys.status))) continue;
      const stateCode = normalizeStateKey(cell(row, recKeys.state));
      if (!stateCode) continue;
      const agg = recruitingByState.get(stateCode) ?? { openPositions: 0, applicants: 0 };
      agg.openPositions += 1;
      agg.applicants += parseApplicantCount(cell(row, recKeys.applicantCount));
      recruitingByState.set(stateCode, agg);
    }
  }

  if (melKeys.storeCall && melKeys.status && melKeys.state) {
    for (const row of melRows) {
      const stateCode = normalizeStateKey(cell(row, melKeys.state));
      if (!stateCode) continue;

      const completed = isCompletedStoreCallStatus(cell(row, melKeys.status));
      const stateAgg = melByState.get(stateCode) ?? {
        openStoreCalls: 0,
        totalCalls: 0,
        completedCalls: 0,
        activeReps: new Set<string>(),
        deadlineDays: [],
      };
      stateAgg.totalCalls += 1;

      const endRaw = endDateKey ? cell(row, endDateKey) : "";
      const endDate = endRaw ? parseCreatedDate(endRaw) : null;
      const deadlineDay = endDate ? daysUntil(endDate) : null;

      if (completed) {
        stateAgg.completedCalls += 1;
      } else {
        stateAgg.openStoreCalls += 1;
        if (deadlineDay !== null) stateAgg.deadlineDays.push(deadlineDay);

        const staffName = cell(row, melKeys.staffName);
        const staffNumber = cell(row, melKeys.staffNumber);
        if (isAssignedRep(staffName)) {
          stateAgg.activeReps.add(staffNumber || staffName);
        }
      }
      melByState.set(stateCode, stateAgg);

      const projectNo = cell(row, melKeys.projectNo) || "—";
      const projectKey = projectNo;
      const projectAgg = projects.get(projectKey) ?? {
        projectNo,
        projectName: cell(row, melKeys.projectName) || "—",
        manager: resolveMarketIdentity({
          city: "",
          state: stateCode,
          manager: cell(row, melKeys.manager),
          source: "mel",
        }).dm,
        state: stateCode,
        openStoreCalls: 0,
        totalCalls: 0,
        completedCalls: 0,
        activeReps: new Set<string>(),
        deadlineDays: [],
      };
      projectAgg.totalCalls += 1;
      if (completed) {
        projectAgg.completedCalls += 1;
      } else {
        projectAgg.openStoreCalls += 1;
        if (deadlineDay !== null) projectAgg.deadlineDays.push(deadlineDay);
        const staffName = cell(row, melKeys.staffName);
        const staffNumber = cell(row, melKeys.staffNumber);
        if (isAssignedRep(staffName)) {
          projectAgg.activeReps.add(staffNumber || staffName);
        }
      }
      projects.set(projectKey, projectAgg);

      const manager = resolveMarketIdentity({
        city: "",
        state: stateCode,
        manager: cell(row, melKeys.manager),
        source: "mel",
      }).dm;
      const dmAgg = dms.get(manager) ?? {
        openStoreCalls: 0,
        totalCalls: 0,
        completedCalls: 0,
        activeReps: new Set<string>(),
        deadlineDays: [],
        states: new Set<string>(),
      };
      dmAgg.totalCalls += 1;
      dmAgg.states.add(stateCode);
      if (completed) {
        dmAgg.completedCalls += 1;
      } else {
        dmAgg.openStoreCalls += 1;
        if (deadlineDay !== null) dmAgg.deadlineDays.push(deadlineDay);
        const staffName = cell(row, melKeys.staffName);
        const staffNumber = cell(row, melKeys.staffNumber);
        if (isAssignedRep(staffName)) {
          dmAgg.activeReps.add(staffNumber || staffName);
        }
      }
      dms.set(manager, dmAgg);
    }
  }

  const allStateKeys = new Set([...melByState.keys(), ...recruitingByState.keys()]);
  const markets: MarketDemandRow[] = [];

  for (const stateCode of allStateKeys) {
    const mel = melByState.get(stateCode);
    const rec = recruitingByState.get(stateCode);
    if (!mel && !rec) continue;

    const openStoreCalls = mel?.openStoreCalls ?? 0;
    const totalCalls = mel?.totalCalls ?? 0;
    const completionPercent =
      totalCalls > 0 && mel
        ? Math.round((mel.completedCalls / totalCalls) * 1000) / 10
        : null;
    const activeReps = mel?.activeReps.size ?? 0;
    const nearestDeadlineDays =
      mel && mel.deadlineDays.length > 0 ? Math.min(...mel.deadlineDays) : null;
    const applicants = rec?.applicants ?? 0;
    const openPositions = rec?.openPositions ?? 0;

    const demandScore = computeDemandScore({
      openStoreCalls,
      activeReps,
      completionPercent,
      nearestDeadlineDays,
      applicants,
      openPositions,
    });
    const urgency = computeMarketUrgency(demandScore);
    const recommendations = buildRecommendations({
      urgency,
      openStoreCalls,
      activeReps,
      applicants,
      openPositions,
      nearestDeadlineDays,
    });

    markets.push({
      market: stateCode,
      stateCode,
      demandScore,
      urgency,
      openStoreCalls,
      activeReps,
      completionPercent,
      nearestDeadlineDays,
      applicants,
      openPositions,
      recommendations,
    });
  }

  markets.sort((a, b) => b.demandScore - a.demandScore || b.openStoreCalls - a.openStoreCalls);

  const projectsAtRisk: ProjectStaffingRiskRow[] = [];
  for (const project of projects.values()) {
    if (project.openStoreCalls === 0) continue;

    const completionPercent =
      project.totalCalls > 0
        ? Math.round((project.completedCalls / project.totalCalls) * 1000) / 10
        : null;
    const activeReps = project.activeReps.size;
    const nearestDeadlineDays =
      project.deadlineDays.length > 0 ? Math.min(...project.deadlineDays) : null;
    const rec = recruitingByState.get(project.state);
    const applicants = rec?.applicants ?? 0;

    const riskScore = computeDemandScore({
      openStoreCalls: project.openStoreCalls,
      activeReps,
      completionPercent,
      nearestDeadlineDays,
      applicants,
      openPositions: rec?.openPositions ?? 0,
    });
    const urgency = computeMarketUrgency(riskScore);

    projectsAtRisk.push({
      projectNo: project.projectNo,
      projectName: project.projectName,
      manager: project.manager,
      state: project.state,
      openStoreCalls: project.openStoreCalls,
      activeReps,
      completionPercent,
      nearestDeadlineDays,
      applicants,
      riskScore,
      urgency,
      recommendations: buildRecommendations({
        urgency,
        openStoreCalls: project.openStoreCalls,
        activeReps,
        applicants,
        openPositions: rec?.openPositions ?? 0,
        nearestDeadlineDays,
      }),
    });
  }

  projectsAtRisk.sort((a, b) => b.riskScore - a.riskScore || b.openStoreCalls - a.openStoreCalls);

  const dmGaps: DmStaffingGapRow[] = [];
  for (const [manager, dm] of dms.entries()) {
    if (dm.openStoreCalls === 0) continue;

    const completionPercent =
      dm.totalCalls > 0 ? Math.round((dm.completedCalls / dm.totalCalls) * 1000) / 10 : null;
    const activeReps = dm.activeReps.size;
    let openPositions = 0;
    let applicants = 0;
    for (const stateCode of dm.states) {
      const rec = recruitingByState.get(stateCode);
      if (rec) {
        openPositions += rec.openPositions;
        applicants += rec.applicants;
      }
    }

    const staffingGap = Math.max(0, dm.openStoreCalls - activeReps);
    const nearestDeadlineDays =
      dm.deadlineDays.length > 0 ? Math.min(...dm.deadlineDays) : null;
    const urgency = computeMarketUrgency(
      computeDemandScore({
        openStoreCalls: dm.openStoreCalls,
        activeReps,
        completionPercent,
        nearestDeadlineDays,
        applicants,
        openPositions,
      }),
    );

    dmGaps.push({
      manager,
      openStoreCalls: dm.openStoreCalls,
      activeReps,
      staffingGap,
      openPositions,
      applicants,
      completionPercent,
      recommendations: buildRecommendations({
        urgency,
        openStoreCalls: dm.openStoreCalls,
        activeReps,
        applicants,
        openPositions,
        nearestDeadlineDays,
      }),
    });
  }

  dmGaps.sort((a, b) => b.staffingGap - a.staffingGap || b.openStoreCalls - a.openStoreCalls);

  const topMarkets = markets.slice(0, CHART_LIMIT);

  const storeCallsVsApplicants: ComparisonBar[] = topMarkets.map((m) => ({
    label: m.stateCode,
    primary: m.openStoreCalls,
    secondary: m.applicants,
  }));

  const activeRepsVsOpenCalls: ComparisonBar[] = topMarkets.map((m) => ({
    label: m.stateCode,
    primary: m.activeReps,
    secondary: m.openStoreCalls,
  }));

  const completionByProject: ChartBar[] = projectsAtRisk
    .filter((p) => p.completionPercent !== null)
    .slice(0, CHART_LIMIT)
    .map((p) => ({
      label: p.projectNo !== "—" ? `${p.projectNo}` : p.projectName.slice(0, 24),
      value: p.completionPercent ?? 0,
    }));

  const hints: string[] = [];
  if (melKeys.missingColumns.length > 0) {
    hints.push(`MEL missing: ${melKeys.missingColumns.join(", ")}`);
  }
  if (recKeys.missingForKpis.length > 0) {
    hints.push(`Recruiting missing: ${recKeys.missingForKpis.join(", ")}`);
  }
  if (!endDateKey) hints.push("MEL End Date not mapped (deadline factor reduced)");

  return {
    markets: markets.slice(0, TABLE_LIMIT),
    projectsAtRisk: projectsAtRisk.slice(0, TABLE_LIMIT),
    dmGaps: dmGaps.slice(0, TABLE_LIMIT),
    storeCallsVsApplicants,
    activeRepsVsOpenCalls,
    completionByProject,
    columnHint:
      hints.length > 0
        ? `Joined by state · ${hints.join(" · ")}`
        : "MEL store calls joined to recruiting opens by state",
  };
}

export const URGENCY_BADGE_STYLES: Record<MarketUrgency, string> = {
  Critical: "bg-red-500/15 text-red-200 ring-1 ring-red-500/30",
  High: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
  Moderate: "bg-yellow-500/15 text-yellow-200 ring-1 ring-yellow-500/30",
  Stable: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
};

export function formatDeadlineDays(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d`;
}
