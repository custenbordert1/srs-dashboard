import type { Kpi } from "@/lib/recruiting-sample-data";
import { normalizeState as normalizeIdentityState, resolveMarketIdentity } from "@/lib/market-identity";
import type { SheetRow } from "@/lib/google-sheet-csv";
import {
  calendarAgeDays,
  parseApplicantCount,
  parseCreatedDate,
} from "@/lib/post-automation";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";

export type RecruitingRiskLevel = "Low" | "Medium" | "High";

export type ChartBar = {
  label: string;
  value: number;
};

export type IntelligenceOpenPost = {
  jobTitle: string;
  city: string;
  state: string;
  manager: string;
  applicantCount: number;
  daysOpen: number | null;
  openings: number;
  storeCount: number;
  isRural: boolean;
  aPlusScore: number;
  riskLevel: RecruitingRiskLevel;
};

export type RecruitingIntelligenceSnapshot = {
  openPosts: number;
  zeroApplicantPosts: number;
  avgApplicantsPerOpening: number | null;
  topStates: ChartBar[];
  topManagers: ChartBar[];
  conversionEstimatePercent: number | null;
  applicantsByState: ChartBar[];
  openingsByManager: ChartBar[];
  zeroApplicantTrend: ChartBar[];
  aPlusOpportunities: IntelligenceOpenPost[];
  columnHint: string;
};

const JOB_TITLE_ALIASES = ["job title", "title", "role", "position", "job"];
const OPENINGS_ALIASES = ["openings", "# openings", "opening count", "stores", "store count", "# stores"];

/** States commonly treated as rural / harder-to-fill markets for field recruiting. */
const RURAL_STATE_CODES = new Set([
  "AK",
  "AR",
  "IA",
  "ID",
  "KS",
  "KY",
  "LA",
  "ME",
  "MS",
  "MT",
  "ND",
  "NE",
  "NH",
  "NM",
  "OK",
  "SD",
  "VT",
  "WV",
  "WY",
]);

const A_PLUS_TABLE_LIMIT = 50;

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

function normalizeState(raw: string): string {
  return normalizeIdentityState(raw);
}

export function isRuralState(stateRaw: string): boolean {
  const code = normalizeState(stateRaw);
  return code.length === 2 && RURAL_STATE_CODES.has(code);
}

function parseOpenings(raw: string): number {
  const n = Number.parseInt(String(raw).replace(/,/g, "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 1) return 1;
  return n;
}

export function computeRecruitingRiskLevel(input: {
  applicantCount: number;
  daysOpen: number | null;
  state: string;
  openings: number;
}): RecruitingRiskLevel {
  let points = 0;

  if (input.applicantCount === 0) points += 3;
  else if (input.applicantCount <= 2) points += 1;

  if (input.daysOpen !== null) {
    if (input.daysOpen > 14) points += 3;
    else if (input.daysOpen > 7) points += 2;
    else if (input.daysOpen > 3) points += 1;
  }

  if (isRuralState(input.state)) points += 2;

  if (input.openings >= 5) points += 1;

  if (points >= 6) return "High";
  if (points >= 3) return "Medium";
  return "Low";
}

function computeAPlusScore(input: {
  applicantCount: number;
  daysOpen: number | null;
  storeCount: number;
  isRural: boolean;
}): number {
  let score = 0;
  if (input.applicantCount === 0) score += 40;
  if (input.daysOpen !== null && input.daysOpen > 7) score += 25;
  if (input.storeCount >= 5) score += 20;
  else if (input.storeCount >= 3) score += 10;
  if (input.isRural) score += 15;
  return score;
}

function incrementMap(map: Map<string, number>, key: string, delta = 1) {
  const k = key.trim() || "—";
  map.set(k, (map.get(k) ?? 0) + delta);
}

function topEntries(map: Map<string, number>, limit: number): ChartBar[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function weekBucketLabel(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

export function computeRecruitingIntelligence(
  rows: SheetRow[],
  headers: string[],
): RecruitingIntelligenceSnapshot {
  const keys = resolveKpiSheetColumnKeys(headers);
  const jobTitleKey = pickColumn(headers, JOB_TITLE_ALIASES);
  const openingsKey = pickColumn(headers, OPENINGS_ALIASES);

  if (!keys.status || !keys.applicantCount) {
    const missing =
      keys.missingForKpis.length > 0
        ? `Missing: ${keys.missingForKpis.join(", ")}`
        : "Could not map sheet columns";
    return emptySnapshot(missing);
  }

  const titleCounts = new Map<string, number>();
  for (const row of rows) {
    if (!isOpenPostStatus(cell(row, keys.status))) continue;
    const title = cell(row, jobTitleKey) || "Untitled role";
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  const openPosts: IntelligenceOpenPost[] = [];
  const stateOpenings = new Map<string, number>();
  const stateApplicants = new Map<string, number>();
  const managerOpenings = new Map<string, number>();
  const zeroByWeek = new Map<string, number>();

  let openCount = 0;
  let zeroApplicantPosts = 0;
  let totalApplicants = 0;
  let postsWithApplicants = 0;

  for (const row of rows) {
    if (!isOpenPostStatus(cell(row, keys.status))) continue;

    openCount += 1;
    const jobTitle = cell(row, jobTitleKey) || "Untitled role";
    const identity = resolveMarketIdentity({
      city: cell(row, keys.city),
      state: cell(row, keys.state),
      manager: cell(row, keys.manager),
      source: "recruiting",
    });
    const city = identity.city;
    const state = identity.state || "—";
    const manager = identity.dm;
    const applicantCount = parseApplicantCount(cell(row, keys.applicantCount));
    const openings = openingsKey ? parseOpenings(cell(row, openingsKey)) : 1;
    const storeCount = titleCounts.get(jobTitle) ?? 1;

    const created = keys.createdDate ? parseCreatedDate(cell(row, keys.createdDate)) : null;
    const daysOpen = created ? calendarAgeDays(created) : null;
    const rural = isRuralState(state);

    totalApplicants += applicantCount;
    if (applicantCount === 0) zeroApplicantPosts += 1;
    else postsWithApplicants += 1;

    incrementMap(stateOpenings, state, openings);
    incrementMap(stateApplicants, state, applicantCount);
    incrementMap(managerOpenings, manager, openings);

    if (applicantCount === 0 && created) {
      incrementMap(zeroByWeek, weekBucketLabel(created), 1);
    }

    const riskLevel = computeRecruitingRiskLevel({
      applicantCount,
      daysOpen,
      state,
      openings,
    });

    const aPlusScore = computeAPlusScore({
      applicantCount,
      daysOpen,
      storeCount,
      isRural: rural,
    });

    if (aPlusScore >= 40) {
      openPosts.push({
        jobTitle,
        city,
        state,
        manager,
        applicantCount,
        daysOpen,
        openings,
        storeCount,
        isRural: rural,
        aPlusScore,
        riskLevel,
      });
    }
  }

  openPosts.sort((a, b) => b.aPlusScore - a.aPlusScore || b.storeCount - a.storeCount);

  const optionalMissing: string[] = [];
  if (!keys.manager) optionalMissing.push("Manager");
  if (!keys.state) optionalMissing.push("State");
  if (!keys.createdDate) optionalMissing.push("Created Date");
  if (!openingsKey) optionalMissing.push("Openings (using 1 per row)");

  const columnHint =
    optionalMissing.length > 0
      ? `Open + Requested · ${optionalMissing.join(", ")} not mapped`
      : "Open + Requested posts from live recruiting sheet";

  const conversionEstimatePercent =
    openCount > 0 ? Math.round((postsWithApplicants / openCount) * 1000) / 10 : null;

  const zeroApplicantTrend = [...zeroByWeek.entries()]
    .sort((a, b) => {
      const da = Date.parse(a[0]);
      const db = Date.parse(b[0]);
      if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
      return a[0].localeCompare(b[0]);
    })
    .slice(-8)
    .map(([label, value]) => ({ label, value }));

  return {
    openPosts: openCount,
    zeroApplicantPosts,
    avgApplicantsPerOpening: openCount > 0 ? totalApplicants / openCount : null,
    topStates: topEntries(stateOpenings, 5),
    topManagers: topEntries(managerOpenings, 5),
    conversionEstimatePercent,
    applicantsByState: topEntries(stateApplicants, 10),
    openingsByManager: topEntries(managerOpenings, 8),
    zeroApplicantTrend,
    aPlusOpportunities: openPosts.slice(0, A_PLUS_TABLE_LIMIT),
    columnHint,
  };
}

function emptySnapshot(columnHint: string): RecruitingIntelligenceSnapshot {
  return {
    openPosts: 0,
    zeroApplicantPosts: 0,
    avgApplicantsPerOpening: null,
    topStates: [],
    topManagers: [],
    conversionEstimatePercent: null,
    applicantsByState: [],
    openingsByManager: [],
    zeroApplicantTrend: [],
    aPlusOpportunities: [],
    columnHint,
  };
}

function formatAvg(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatTopList(items: ChartBar[]): string {
  if (items.length === 0) return "—";
  return items.map((item) => `${item.label} (${item.value})`).join(", ");
}

export function intelligenceSnapshotToKpis(
  snapshot: RecruitingIntelligenceSnapshot,
  sheetError?: string,
): Kpi[] {
  if (sheetError) {
    return [
      { id: "open-posts", label: "Open posts", value: "—", change: "—", changeDirection: "flat", hint: sheetError },
      { id: "zero-applicant", label: "Zero applicant posts", value: "—", change: "—", changeDirection: "flat", hint: sheetError },
      { id: "avg-applicants", label: "Avg applicants / opening", value: "—", change: "—", changeDirection: "flat", hint: sheetError },
      { id: "top-states", label: "Top states by openings", value: "—", change: "—", changeDirection: "flat", hint: sheetError },
      { id: "top-dms", label: "Top DMs by openings", value: "—", change: "—", changeDirection: "flat", hint: sheetError },
      { id: "conversion", label: "Applicant conversion est.", value: "—", change: "—", changeDirection: "flat", hint: sheetError },
    ];
  }

  const conversionValue =
    snapshot.conversionEstimatePercent === null
      ? "—"
      : `${snapshot.conversionEstimatePercent}%`;

  return [
    {
      id: "open-posts",
      label: "Open posts",
      value: snapshot.openPosts.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: snapshot.columnHint,
    },
    {
      id: "zero-applicant",
      label: "Zero applicant posts",
      value: snapshot.zeroApplicantPosts.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Open posts with 0 applicants · ${snapshot.columnHint}`,
    },
    {
      id: "avg-applicants",
      label: "Avg applicants / opening",
      value: formatAvg(snapshot.avgApplicantsPerOpening),
      change: "Live",
      changeDirection: "flat",
      hint: `Mean applicants per open post · ${snapshot.columnHint}`,
    },
    {
      id: "top-states",
      label: "Top states by openings",
      value: snapshot.topStates[0]?.label ?? "—",
      change: snapshot.topStates[0] ? String(snapshot.topStates[0].value) : "—",
      changeDirection: "flat",
      hint: formatTopList(snapshot.topStates) || snapshot.columnHint,
    },
    {
      id: "top-dms",
      label: "Top DMs by openings",
      value: snapshot.topManagers[0]?.label ?? "—",
      change: snapshot.topManagers[0] ? String(snapshot.topManagers[0].value) : "—",
      changeDirection: "flat",
      hint: formatTopList(snapshot.topManagers) || "Manager column not mapped",
    },
    {
      id: "conversion",
      label: "Applicant conversion est.",
      value: conversionValue,
      change: "Live",
      changeDirection: "flat",
      hint: `% of open posts with ≥1 applicant · ${snapshot.columnHint}`,
    },
  ];
}

export const RISK_BADGE_STYLES: Record<RecruitingRiskLevel, string> = {
  Low: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
  Medium: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
  High: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30",
};
