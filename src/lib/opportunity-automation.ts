import type { SheetRow } from "@/lib/google-sheet-csv";
import {
  buildMarketKey,
  resolveMarketIdentity,
} from "@/lib/market-identity";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import {
  isCompletedStoreCallStatus,
  resolveMelProjectColumnKeys,
} from "@/lib/mel-projects-metrics";
import {
  calendarAgeDays,
  parseApplicantCount,
  parseCreatedDate,
} from "@/lib/post-automation";
import {
  computeMarketIntelligence,
  type CityMarketRow,
} from "@/lib/market-intelligence";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";

export type AutomationAction =
  | "Increase posts"
  | "Expand recruiting radius"
  | "Increase pay"
  | "Escalate to recruiting"
  | "Reassign reps"
  | "Pause recruiting"
  | "Close recruiting post"
  | "Open new market"
  | "Push mass opportunities";

export type AutomationPriorityLevel = "Critical" | "High" | "Medium" | "Low";

export type AutomationActionBadge =
  | "Auto"
  | "Needs Review"
  | "Critical"
  | "Ready To Execute";

export type OpportunityAutomationRow = {
  market: string;
  city: string;
  state: string;
  dm: string;
  recommendedAction: AutomationAction;
  reason: string;
  automationScore: number;
  deadline: string;
  deadlineDays: number | null;
  suggestedPriorityLevel: AutomationPriorityLevel;
  actionBadge: AutomationActionBadge;
  demandScore: number;
  openStoreCalls: number;
  applicants: number;
  activeReps: number;
  openRecruitingPosts: number;
};

export type OpportunityAutomationKpis = {
  autoActionsAvailable: number;
  criticalAutomations: number;
  marketsToPause: number;
  marketsToExpand: number;
  reassignOpportunities: number;
};

export type OpportunityAutomationSnapshot = {
  rows: OpportunityAutomationRow[];
  kpis: OpportunityAutomationKpis;
};

const END_DATE_ALIASES = ["end date", "due date", "project end", "deadline"];

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

function deadlineScore(days: number | null): number {
  if (days === null) return 0;
  if (days < 0) return 100;
  if (days <= 3) return 90;
  if (days <= 7) return 75;
  if (days <= 14) return 55;
  if (days <= 30) return 30;
  return 0;
}

function staffingGapScore(row: CityMarketRow): number {
  if (row.openStoreCalls <= 0) return 0;
  const gap = Math.max(0, row.openStoreCalls - row.activeReps);
  return Math.min(100, Math.round((gap / Math.max(row.openStoreCalls, 1)) * 100));
}

function applicantShortageScore(row: CityMarketRow, zeroApplicantDurationDays: number | null): number {
  if (row.openRecruitingPosts <= 0 && row.openStoreCalls <= 0) return 0;
  if (row.applicants === 0) {
    const ageBoost =
      zeroApplicantDurationDays === null ? 0 : Math.min(25, zeroApplicantDurationDays * 2);
    return Math.min(100, 75 + ageBoost);
  }
  if (row.openStoreCalls <= 0) return 15;
  const ratio = row.applicants / Math.max(row.openStoreCalls, 1);
  if (ratio < 0.25) return 80;
  if (ratio < 0.5) return 60;
  if (ratio < 1) return 35;
  return 0;
}

function repShortageScore(row: CityMarketRow): number {
  if (row.openStoreCalls <= 0) return 0;
  if (row.activeReps === 0) return 100;
  const callsPerRep = row.openStoreCalls / row.activeReps;
  if (callsPerRep >= 6) return 90;
  if (callsPerRep >= 4) return 70;
  if (callsPerRep >= 2) return 40;
  return 0;
}

export function computeAutomationPriorityScore(input: {
  demandScore: number;
  deadlineDays: number | null;
  staffingGapScore: number;
  applicantShortageScore: number;
  repShortageScore: number;
}): number {
  const score =
    input.demandScore * 0.35 +
    deadlineScore(input.deadlineDays) * 0.2 +
    input.staffingGapScore * 0.15 +
    input.applicantShortageScore * 0.15 +
    input.repShortageScore * 0.15;

  return Math.min(100, Math.round(score));
}

function priorityLevel(score: number): AutomationPriorityLevel {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}

function actionBadge(input: {
  action: AutomationAction;
  score: number;
  deadlineDays: number | null;
}): AutomationActionBadge {
  if (input.score >= 80 || (input.deadlineDays !== null && input.deadlineDays <= 3)) return "Critical";
  if (["Pause recruiting", "Close recruiting post", "Reassign reps"].includes(input.action)) {
    return "Needs Review";
  }
  if (input.score >= 60) return "Ready To Execute";
  return "Auto";
}

function formatDeadline(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d`;
}

function chooseAction(input: {
  row: CityMarketRow;
  score: number;
  deadlineDays: number | null;
  zeroApplicantDurationDays: number | null;
}): { action: AutomationAction; reason: string } {
  const { row, score, deadlineDays, zeroApplicantDurationDays } = input;
  const staffingGap = Math.max(0, row.openStoreCalls - row.activeReps);
  const appsPerPost = row.applicants / Math.max(row.openRecruitingPosts, 1);

  if (score >= 85 || (deadlineDays !== null && deadlineDays <= 3 && row.openStoreCalls > 0)) {
    return {
      action: "Escalate to recruiting",
      reason: "Critical demand, near deadline, or major staffing gap needs recruiting intervention.",
    };
  }

  if (row.openStoreCalls >= 10 && row.applicants < row.openStoreCalls * 0.25) {
    return {
      action: "Push mass opportunities",
      reason: "High store-call volume with limited applicant supply.",
    };
  }

  if (row.openStoreCalls > 0 && row.openRecruitingPosts === 0) {
    return {
      action: "Open new market",
      reason: "MEL demand exists but no open recruiting post is mapped to this market.",
    };
  }

  if (staffingGap >= 3 && row.activeReps > 0) {
    return {
      action: "Reassign reps",
      reason: "Open store calls exceed active rep coverage.",
    };
  }

  if (row.openRecruitingPosts > 0 && row.applicants === 0) {
    return {
      action: zeroApplicantDurationDays !== null && zeroApplicantDurationDays >= 7
        ? "Increase pay"
        : "Increase posts",
      reason:
        zeroApplicantDurationDays !== null && zeroApplicantDurationDays >= 7
          ? "Zero applicants for more than 7 days."
          : "Open recruiting posts have no applicants.",
    };
  }

  if (row.openStoreCalls >= 3 && row.applicants / Math.max(row.openStoreCalls, 1) < 0.75) {
    return {
      action: "Expand recruiting radius",
      reason: "Applicant coverage is below demand in this market.",
    };
  }

  if (row.openStoreCalls === 0 && row.openRecruitingPosts > 0 && row.applicants > 10) {
    return {
      action: "Pause recruiting",
      reason: "Recruiting supply is healthy while MEL demand is currently low.",
    };
  }

  if (row.openStoreCalls === 0 && row.openRecruitingPosts > 0 && appsPerPost >= 8) {
    return {
      action: "Close recruiting post",
      reason: "No active demand and applicant supply is sufficient.",
    };
  }

  return {
    action: "Increase posts",
    reason: "Moderate opportunity to improve applicant coverage.",
  };
}

function collectDeadlineDays(
  melRows: MelProjectRow[],
  melHeaders: string[],
): Map<string, number> {
  const melKeys = resolveMelProjectColumnKeys(melHeaders);
  const endDateKey = pickColumn(melHeaders, END_DATE_ALIASES);
  const deadlines = new Map<string, number>();

  if (!melKeys.status || !melKeys.state || !endDateKey) return deadlines;

  for (const row of melRows) {
    if (isCompletedStoreCallStatus(cell(row, melKeys.status))) continue;
    const identity = resolveMarketIdentity({
      city: cell(row, "City"),
      state: cell(row, melKeys.state),
      manager: cell(row, melKeys.manager),
      source: "mel",
    });
    if (!identity.key) continue;
    const endDate = parseCreatedDate(cell(row, endDateKey));
    if (!endDate) continue;
    const days = Math.round(
      (Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) -
        Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) /
        (24 * 60 * 60 * 1000),
    );
    const existing = deadlines.get(identity.key);
    if (existing === undefined || days < existing) deadlines.set(identity.key, days);
  }

  return deadlines;
}

function collectZeroApplicantDurations(
  recruitingRows: SheetRow[],
  recruitingHeaders: string[],
): Map<string, number> {
  const keys = resolveKpiSheetColumnKeys(recruitingHeaders);
  const durations = new Map<string, number>();

  if (!keys.status || !keys.applicantCount || !keys.createdDate) return durations;

  for (const row of recruitingRows) {
    if (!isOpenPostStatus(cell(row, keys.status))) continue;
    if (parseApplicantCount(cell(row, keys.applicantCount)) !== 0) continue;
    const identity = resolveMarketIdentity({
      city: cell(row, keys.city),
      state: cell(row, keys.state),
      manager: cell(row, keys.manager),
      source: "recruiting",
    });
    if (!identity.key) continue;
    const created = parseCreatedDate(cell(row, keys.createdDate));
    if (!created) continue;
    const age = calendarAgeDays(created);
    durations.set(identity.key, Math.max(durations.get(identity.key) ?? 0, age));
  }

  return durations;
}

function buildRow(
  row: CityMarketRow,
  deadlineDays: number | null,
  zeroApplicantDurationDays: number | null,
): OpportunityAutomationRow {
  const gapScore = staffingGapScore(row);
  const shortageScore = applicantShortageScore(row, zeroApplicantDurationDays);
  const repScore = repShortageScore(row);
  const automationScore = computeAutomationPriorityScore({
    demandScore: row.marketRiskScore,
    deadlineDays,
    staffingGapScore: gapScore,
    applicantShortageScore: shortageScore,
    repShortageScore: repScore,
  });
  const { action, reason } = chooseAction({
    row,
    score: automationScore,
    deadlineDays,
    zeroApplicantDurationDays,
  });

  return {
    market: row.label,
    city: row.city,
    state: row.stateCode,
    dm: row.manager,
    recommendedAction: action,
    reason,
    automationScore,
    deadline: formatDeadline(deadlineDays),
    deadlineDays,
    suggestedPriorityLevel: priorityLevel(automationScore),
    actionBadge: actionBadge({ action, score: automationScore, deadlineDays }),
    demandScore: row.marketRiskScore,
    openStoreCalls: row.openStoreCalls,
    applicants: row.applicants,
    activeReps: row.activeReps,
    openRecruitingPosts: row.openRecruitingPosts,
  };
}

function shouldInclude(row: OpportunityAutomationRow): boolean {
  return (
    row.automationScore >= 30 ||
    row.recommendedAction === "Pause recruiting" ||
    row.recommendedAction === "Close recruiting post"
  );
}

function buildKpis(rows: OpportunityAutomationRow[]): OpportunityAutomationKpis {
  return {
    autoActionsAvailable: rows.filter((row) => row.actionBadge === "Auto" || row.actionBadge === "Ready To Execute").length,
    criticalAutomations: rows.filter((row) => row.suggestedPriorityLevel === "Critical").length,
    marketsToPause: rows.filter((row) => row.recommendedAction === "Pause recruiting" || row.recommendedAction === "Close recruiting post").length,
    marketsToExpand: rows.filter((row) => row.recommendedAction === "Expand recruiting radius" || row.recommendedAction === "Open new market").length,
    reassignOpportunities: rows.filter((row) => row.recommendedAction === "Reassign reps").length,
  };
}

export function buildOpportunityAutomationSnapshot(
  recruitingRows: SheetRow[],
  recruitingHeaders: string[],
  melRows: MelProjectRow[],
  melHeaders: string[],
): OpportunityAutomationSnapshot {
  const marketSnapshot = computeMarketIntelligence(
    recruitingRows,
    recruitingHeaders,
    melRows,
    melHeaders,
  );
  const deadlineDaysByMarket = collectDeadlineDays(melRows, melHeaders);
  const zeroApplicantDurations = collectZeroApplicantDurations(recruitingRows, recruitingHeaders);

  const rows = marketSnapshot.cities
    .map((market) => {
      const key = buildMarketKey(market.city, market.stateCode);
      return buildRow(
        market,
        deadlineDaysByMarket.get(key) ?? null,
        zeroApplicantDurations.get(key) ?? null,
      );
    })
    .filter(shouldInclude)
    .sort(
      (a, b) =>
        b.automationScore - a.automationScore ||
        b.demandScore - a.demandScore ||
        b.openStoreCalls - a.openStoreCalls,
    );

  return {
    rows,
    kpis: buildKpis(rows),
  };
}
