import type { BreezyCandidate } from "@/lib/breezy-api";
import { resolveMarketIdentity } from "@/lib/market-identity";
import type { ChartBar } from "@/lib/recruiting-intelligence";
import type { Kpi } from "@/lib/recruiting-sample-data";

export type CandidateIntelligenceRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  dm: string;
  position: string;
  source: string;
  status: string;
  recruiter: string;
  ageDays: number | null;
  daysSinceUpdate: number | null;
  candidateQualityScore: number;
  responseSpeedScore: number;
  interviewConversionScore: number;
  hireProbabilityScore: number;
};

export type CandidateDetectionRow = {
  id: string;
  name: string;
  market: string;
  dm: string;
  recruiter: string;
  status: string;
  ageDays: number | null;
  daysSinceUpdate: number | null;
  reason: string;
};

export type CandidateIntelligenceSnapshot = {
  rows: CandidateIntelligenceRow[];
  kpis: Kpi[];
  pipelineFunnel: ChartBar[];
  applicantsByMarket: ChartBar[];
  applicantsByState: ChartBar[];
  applicantsByDm: ChartBar[];
  applicantsByPosition: ChartBar[];
  applicantsBySource: ChartBar[];
  applicantsByStatus: ChartBar[];
  applicantsByAge: ChartBar[];
  applicantsByRecruiter: ChartBar[];
  hiringVelocityTrend: ChartBar[];
  stalledCandidates: CandidateDetectionRow[];
  agingApplicants: CandidateDetectionRow[];
  ghostedCandidates: CandidateDetectionRow[];
  overloadedRecruiters: ChartBar[];
  highPerformingMarkets: ChartBar[];
};

const TERMINAL_STAGE_WORDS = ["hired", "rejected", "disqualified", "withdrawn", "archived"];
const INTERVIEW_STAGE_WORDS = ["interview", "onsite", "phone screen", "screen", "assessment"];
const OFFER_STAGE_WORDS = ["offer"];
const HIRE_STAGE_WORDS = ["hired"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function nestedString(candidate: BreezyCandidate, paths: string[][]): string {
  const root = candidate as Record<string, unknown>;
  for (const path of paths) {
    let current: unknown = root;
    for (const segment of path) {
      current = asRecord(current)?.[segment];
    }
    if (typeof current === "string" && current.trim()) return current.trim();
    if (typeof current === "number") return String(current);
  }
  return "";
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageDays(date: Date | null, now = new Date()): number | null {
  if (!date) return null;
  const start = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

function includesAny(value: string, words: string[]): boolean {
  const normalized = value.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function isTerminalStage(status: string): boolean {
  return includesAny(status, TERMINAL_STAGE_WORDS);
}

function isInterviewStage(status: string): boolean {
  return includesAny(status, INTERVIEW_STAGE_WORDS);
}

function isOfferStage(status: string): boolean {
  return includesAny(status, OFFER_STAGE_WORDS);
}

function isHireStage(status: string): boolean {
  return includesAny(status, HIRE_STAGE_WORDS);
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  const normalized = key.trim() || "Unknown";
  map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function topEntries(map: Map<string, number>, limit: number): ChartBar[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function ageBucket(days: number | null): string {
  if (days === null) return "Unknown";
  if (days <= 1) return "0-1d";
  if (days <= 7) return "2-7d";
  if (days <= 14) return "8-14d";
  if (days <= 30) return "15-30d";
  return "31d+";
}

function weekLabel(date: Date | null): string {
  if (!date) return "Unknown";
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}

function candidateMarket(candidate: BreezyCandidate) {
  const record = candidate as Record<string, unknown>;
  const city =
    stringField(record, ["city", "location_city"]) ||
    nestedString(candidate, [["address", "city"], ["location", "city"], ["position", "location", "city"]]);
  const state =
    stringField(record, ["state", "region", "location_state"]) ||
    nestedString(candidate, [["address", "state"], ["location", "state"], ["position", "location", "state"]]);
  const manager = nestedString(candidate, [["recruiter", "name"], ["owner", "name"], ["user", "name"]]);
  return resolveMarketIdentity({ city, state, manager, source: "recruiting" });
}

function candidatePosition(candidate: BreezyCandidate): string {
  return (
    nestedString(candidate, [["position", "name"], ["position", "title"]]) ||
    stringField(candidate as Record<string, unknown>, ["position_name", "position_title", "position_id"]) ||
    candidate.position_id ||
    "Unknown position"
  );
}

function candidateSource(candidate: BreezyCandidate): string {
  return (
    nestedString(candidate, [["source", "name"]]) ||
    stringField(candidate as Record<string, unknown>, ["source", "origin", "candidate_source"]) ||
    "Unknown source"
  );
}

function candidateStatus(candidate: BreezyCandidate): string {
  return (
    nestedString(candidate, [["stage", "name"], ["status", "name"]]) ||
    stringField(candidate as Record<string, unknown>, ["status", "stage_name"]) ||
    "Unknown status"
  );
}

function candidateRecruiter(candidate: BreezyCandidate): string {
  return (
    nestedString(candidate, [
      ["recruiter", "name"],
      ["owner", "name"],
      ["user", "name"],
      ["assigned_to", "name"],
      ["creator", "name"],
    ]) || "Unassigned"
  );
}

export function computeCandidateQualityScore(candidate: BreezyCandidate, status: string): number {
  let score = 35;
  if (candidate.email_address) score += 15;
  if (candidate.phone_number) score += 10;
  if (asRecord((candidate as Record<string, unknown>).resume)) score += 15;
  if (candidateSource(candidate) !== "Unknown source") score += 10;
  if (isInterviewStage(status)) score += 10;
  if (isOfferStage(status) || isHireStage(status)) score += 15;
  return Math.min(100, score);
}

export function computeResponseSpeedScore(daysSinceUpdate: number | null): number {
  if (daysSinceUpdate === null) return 50;
  if (daysSinceUpdate <= 1) return 100;
  if (daysSinceUpdate <= 3) return 85;
  if (daysSinceUpdate <= 7) return 65;
  if (daysSinceUpdate <= 14) return 35;
  return 10;
}

export function computeInterviewConversionScore(status: string): number {
  if (isHireStage(status)) return 100;
  if (isOfferStage(status)) return 85;
  if (isInterviewStage(status)) return 65;
  if (isTerminalStage(status)) return 0;
  return 25;
}

export function computeHireProbabilityScore(input: {
  candidateQualityScore: number;
  responseSpeedScore: number;
  interviewConversionScore: number;
  status: string;
}): number {
  if (isTerminalStage(input.status) && !isHireStage(input.status)) return 0;
  return Math.round(
    input.candidateQualityScore * 0.35 +
      input.responseSpeedScore * 0.25 +
      input.interviewConversionScore * 0.4,
  );
}

function toDetection(row: CandidateIntelligenceRow, reason: string): CandidateDetectionRow {
  return {
    id: row.id,
    name: row.name,
    market: row.state === "—" ? row.city : `${row.city}, ${row.state}`,
    dm: row.dm,
    recruiter: row.recruiter,
    status: row.status,
    ageDays: row.ageDays,
    daysSinceUpdate: row.daysSinceUpdate,
    reason,
  };
}

function buildKpis(rows: CandidateIntelligenceRow[]): Kpi[] {
  const newToday = rows.filter((row) => row.ageDays === 0).length;
  const stalled = rows.filter(
    (row) => !isTerminalStage(row.status) && (row.daysSinceUpdate ?? 0) >= 14,
  ).length;
  const avgDays =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + (row.ageDays ?? 0), 0) / rows.length
      : 0;
  const interviewCount = rows.filter((row) => isInterviewStage(row.status)).length;
  const offerCount = rows.filter((row) => isOfferStage(row.status)).length;
  const interviewConversion = rows.length > 0 ? Math.round((interviewCount / rows.length) * 1000) / 10 : 0;
  const offerConversion = rows.length > 0 ? Math.round((offerCount / rows.length) * 1000) / 10 : 0;
  const recentHires = rows.filter((row) => isHireStage(row.status) && (row.ageDays ?? 999) <= 30).length;

  return [
    {
      id: "new-applicants-today",
      label: "New applicants today",
      value: newToday.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: "Candidates created today",
    },
    {
      id: "stalled-candidates",
      label: "Stalled candidates",
      value: stalled.toLocaleString(),
      change: "Live",
      changeDirection: stalled > 0 ? "down" : "flat",
      hint: "Active candidates not updated in 14+ days",
    },
    {
      id: "avg-days-pipeline",
      label: "Avg days in pipeline",
      value: rows.length > 0 ? (Math.round(avgDays * 10) / 10).toString() : "—",
      change: "Live",
      changeDirection: "flat",
      hint: "Average candidate age from creation date",
    },
    {
      id: "interview-conversion",
      label: "Interview conversion %",
      value: `${interviewConversion}%`,
      change: "Live",
      changeDirection: "flat",
      hint: "Share of candidates in interview or screen stages",
    },
    {
      id: "offer-conversion",
      label: "Offer conversion %",
      value: `${offerConversion}%`,
      change: "Live",
      changeDirection: "flat",
      hint: "Share of candidates in offer stage",
    },
    {
      id: "hiring-velocity",
      label: "Hiring velocity",
      value: recentHires.toLocaleString(),
      change: "30d",
      changeDirection: "flat",
      hint: "Hired candidates created in the last 30 days",
    },
  ];
}

export function buildCandidateIntelligence(candidates: BreezyCandidate[]): CandidateIntelligenceSnapshot {
  const byState = new Map<string, number>();
  const byMarket = new Map<string, number>();
  const byDm = new Map<string, number>();
  const byPosition = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byAge = new Map<string, number>();
  const byRecruiter = new Map<string, number>();
  const velocity = new Map<string, number>();
  const marketPerformance = new Map<string, number>();
  const recruiterCounts = new Map<string, number>();

  const rows: CandidateIntelligenceRow[] = candidates.map((candidate) => {
    const record = candidate as Record<string, unknown>;
    const market = candidateMarket(candidate);
    const created = parseDate(record.creation_date ?? record.created_at ?? record.created);
    const updated = parseDate(record.updated_date ?? record.updated_at ?? record.last_activity_date);
    const daysOld = ageDays(created);
    const daysUpdated = ageDays(updated ?? created);
    const status = candidateStatus(candidate);
    const candidateQualityScore = computeCandidateQualityScore(candidate, status);
    const responseSpeedScore = computeResponseSpeedScore(daysUpdated);
    const interviewConversionScore = computeInterviewConversionScore(status);
    const hireProbabilityScore = computeHireProbabilityScore({
      candidateQualityScore,
      responseSpeedScore,
      interviewConversionScore,
      status,
    });
    const recruiter = candidateRecruiter(candidate);
    const position = candidatePosition(candidate);
    const source = candidateSource(candidate);

    const row: CandidateIntelligenceRow = {
      id: candidate._id,
      name: candidate.name || candidate.email_address || "Unknown candidate",
      city: market.city,
      state: market.state || "—",
      dm: market.dm,
      position,
      source,
      status,
      recruiter,
      ageDays: daysOld,
      daysSinceUpdate: daysUpdated,
      candidateQualityScore,
      responseSpeedScore,
      interviewConversionScore,
      hireProbabilityScore,
    };

    increment(byState, row.state);
    increment(byMarket, market.marketName);
    increment(byDm, row.dm);
    increment(byPosition, position);
    increment(bySource, source);
    increment(byStatus, status);
    increment(byAge, ageBucket(daysOld));
    increment(byRecruiter, recruiter);
    increment(recruiterCounts, recruiter);
    if (isHireStage(status)) increment(velocity, weekLabel(created));
    if (market.complete) {
      increment(marketPerformance, market.marketName, hireProbabilityScore);
    }

    return row;
  });

  const stalledCandidates = rows
    .filter((row) => !isTerminalStage(row.status) && (row.daysSinceUpdate ?? 0) >= 14)
    .map((row) => toDetection(row, "No candidate update in 14+ days"))
    .slice(0, 25);
  const agingApplicants = rows
    .filter((row) => !isTerminalStage(row.status) && (row.ageDays ?? 0) >= 21)
    .map((row) => toDetection(row, "Candidate has been in pipeline for 21+ days"))
    .slice(0, 25);
  const ghostedCandidates = rows
    .filter(
      (row) =>
        !isTerminalStage(row.status) &&
        !isInterviewStage(row.status) &&
        (row.daysSinceUpdate ?? 0) >= 10,
    )
    .map((row) => toDetection(row, "Early-stage candidate appears ghosted"))
    .slice(0, 25);
  const overloadedRecruiters = topEntries(recruiterCounts, 25).filter((row) => row.value >= 25);

  return {
    rows,
    kpis: buildKpis(rows),
    pipelineFunnel: topEntries(byStatus, 8),
    applicantsByMarket: topEntries(byMarket, 10),
    applicantsByState: topEntries(byState, 10),
    applicantsByDm: topEntries(byDm, 10),
    applicantsByPosition: topEntries(byPosition, 10),
    applicantsBySource: topEntries(bySource, 8),
    applicantsByStatus: topEntries(byStatus, 8),
    applicantsByAge: ["0-1d", "2-7d", "8-14d", "15-30d", "31d+", "Unknown"].map((label) => ({
      label,
      value: byAge.get(label) ?? 0,
    })),
    applicantsByRecruiter: topEntries(byRecruiter, 10),
    hiringVelocityTrend: [...velocity.entries()]
      .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
      .map(([label, value]) => ({ label, value })),
    stalledCandidates,
    agingApplicants,
    ghostedCandidates,
    overloadedRecruiters,
    highPerformingMarkets: topEntries(marketPerformance, 10),
  };
}
