import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildCandidateIntelligence, type CandidateIntelligenceRow } from "@/lib/candidate-intelligence";
import type { SheetRow } from "@/lib/google-sheet-csv";
import {
  analyzeMarketIdentityQuality,
  normalizeMarketKey,
  resolveMarketIdentity,
} from "@/lib/market-identity";
import { computeMarketIntelligence } from "@/lib/market-intelligence";
import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import {
  isCompletedStoreCallStatus,
  resolveMelProjectColumnKeys,
} from "@/lib/mel-projects-metrics";
import { buildOpportunityAutomationSnapshot, type OpportunityAutomationRow } from "@/lib/opportunity-automation";
import {
  calendarAgeDays,
  parseApplicantCount,
  parseCreatedDate,
} from "@/lib/post-automation";
import { isOpenPostStatus, resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";

export type MarketStatusLabel = "Healthy" | "Warning" | "Critical" | "Dead Zone" | "Oversaturated";

export type LiveMarketRecommendation =
  | "Increase pay"
  | "Close req"
  | "Escalate to recruiter"
  | "Push opportunities"
  | "Add metro hiring"
  | "Open neighboring market"
  | "Reassign recruiter"
  | "Trigger training class";

export type LiveMarketIntelligenceRow = {
  key: string;
  market: string;
  city: string;
  state: string;
  dmOwner: string;
  recruiterOwner: string;
  totalOpenings: number;
  zeroApplicantOpenings: number;
  applicantVelocity: number;
  averageDaysOpen: number | null;
  recruitingRiskScore: number;
  staffingUrgencyScore: number;
  activeRepsNearby: number;
  openOpportunitiesNearby: number;
  marketHealthScore: number;
  status: MarketStatusLabel;
  applicantConversionPercent: number;
  candidatePipelineTotal: number;
  candidatePipelineBreakdown: Array<{ status: string; count: number }>;
  automationRecommendations: OpportunityAutomationRow[];
  recommendations: LiveMarketRecommendation[];
  dataQualityConfidence: number;
  dataQualityIssues: string[];
  recruitingDetails: Array<{
    status: string;
    applicants: number;
    daysOpen: number | null;
  }>;
  melProjects: Array<{
    projectNo: string;
    projectName: string;
    storeCall: string;
    status: string;
    rep: string;
  }>;
  activityHistory: Array<{
    label: string;
    detail: string;
  }>;
};

export type LiveMarketIntelligenceSnapshot = {
  markets: LiveMarketIntelligenceRow[];
  byKey: Record<string, LiveMarketIntelligenceRow>;
  dataQuality: ReturnType<typeof analyzeMarketIdentityQuality>;
};

const MEL_CITY_ALIASES = ["city", "location city", "store city"];

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) set.set(normHeader(h), h);
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

function cell(row: SheetRow | MelProjectRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function weightedScore(parts: Array<{ value: number; weight: number }>): number {
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return 0;
  return clamp(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight);
}

function candidateConverted(row: CandidateIntelligenceRow): boolean {
  const status = row.status.toLowerCase();
  return (
    status.includes("interview") ||
    status.includes("screen") ||
    status.includes("offer") ||
    status.includes("hired")
  );
}

function mode(values: string[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? fallback;
}

function marketStatus(input: {
  marketHealthScore: number;
  totalOpenings: number;
  zeroApplicantOpenings: number;
  applicants: number;
  openStoreCalls: number;
  activeRepsNearby: number;
}): MarketStatusLabel {
  if ((input.totalOpenings > 0 || input.openStoreCalls > 0) && input.applicants === 0 && input.activeRepsNearby === 0) {
    return "Dead Zone";
  }
  if (input.openStoreCalls === 0 && input.applicants >= 10 && input.totalOpenings > 0) return "Oversaturated";
  if (input.marketHealthScore <= 35) return "Critical";
  if (input.marketHealthScore <= 65) return "Warning";
  return "Healthy";
}

function recommendations(input: {
  status: MarketStatusLabel;
  zeroApplicantOpenings: number;
  averageDaysOpen: number | null;
  recruiterOwner: string;
  openStoreCalls: number;
  applicants: number;
  applicantConversionPercent: number;
  activeRepsNearby: number;
  openOpportunitiesNearby: number;
  staffingUrgencyScore: number;
}): LiveMarketRecommendation[] {
  const recs = new Set<LiveMarketRecommendation>();
  if (input.zeroApplicantOpenings > 0 && (input.averageDaysOpen ?? 0) >= 7) recs.add("Increase pay");
  if (input.status === "Oversaturated") recs.add("Close req");
  if (!input.recruiterOwner || input.recruiterOwner === "Unassigned") recs.add("Escalate to recruiter");
  if (input.openStoreCalls > 0 && input.applicants > 0) recs.add("Push opportunities");
  if (input.zeroApplicantOpenings > 0 && input.openStoreCalls >= 3) recs.add("Add metro hiring");
  if (input.openOpportunitiesNearby >= 3 && input.applicants < input.openStoreCalls) recs.add("Open neighboring market");
  if (input.staffingUrgencyScore >= 65 && input.activeRepsNearby > 0) recs.add("Reassign recruiter");
  if (input.openStoreCalls >= 5 && input.activeRepsNearby < input.openStoreCalls) recs.add("Trigger training class");
  if (input.applicantConversionPercent < 15 && input.applicants > 0) recs.add("Push opportunities");
  return [...recs];
}

function keyForCandidate(candidate: CandidateIntelligenceRow): string {
  return candidate.state === "—" ? "" : normalizeMarketKey(candidate.city, candidate.state);
}

export function buildLiveMarketIntelligence(input: {
  recruitingRows: SheetRow[];
  recruitingHeaders: string[];
  melRows: MelProjectRow[];
  melHeaders: string[];
  candidates?: BreezyCandidate[];
}): LiveMarketIntelligenceSnapshot {
  const recKeys = resolveKpiSheetColumnKeys(input.recruitingHeaders);
  const melKeys = resolveMelProjectColumnKeys(input.melHeaders);
  const melCityKey = pickColumn(input.melHeaders, MEL_CITY_ALIASES);
  const marketSnapshot = computeMarketIntelligence(
    input.recruitingRows,
    input.recruitingHeaders,
    input.melRows,
    input.melHeaders,
  );
  const automation = buildOpportunityAutomationSnapshot(
    input.recruitingRows,
    input.recruitingHeaders,
    input.melRows,
    input.melHeaders,
  );
  const dataQuality = analyzeMarketIdentityQuality({
    recruitingRows: input.recruitingRows,
    recruitingHeaders: input.recruitingHeaders,
    melRows: input.melRows,
    melHeaders: input.melHeaders,
  });
  const candidateSnapshot = buildCandidateIntelligence(input.candidates ?? []);

  const recruitingDetailsByKey = new Map<string, LiveMarketIntelligenceRow["recruitingDetails"]>();
  const recruiterOwnersByKey = new Map<string, string[]>();
  const daysOpenByKey = new Map<string, number[]>();
  const zeroOpeningsByKey = new Map<string, number>();

  if (recKeys.status && recKeys.city && recKeys.state) {
    for (const row of input.recruitingRows) {
      const identity = resolveMarketIdentity({
        city: cell(row, recKeys.city),
        state: cell(row, recKeys.state),
        manager: cell(row, recKeys.manager),
        source: "recruiting",
      });
      if (!identity.key) continue;
      const status = cell(row, recKeys.status);
      if (!isOpenPostStatus(status)) continue;
      const applicants = parseApplicantCount(cell(row, recKeys.applicantCount));
      const created = recKeys.createdDate ? parseCreatedDate(cell(row, recKeys.createdDate)) : null;
      const daysOpen = created ? Math.max(0, calendarAgeDays(created)) : null;
      const details = recruitingDetailsByKey.get(identity.key) ?? [];
      details.push({ status, applicants, daysOpen });
      recruitingDetailsByKey.set(identity.key, details);
      if (applicants === 0) zeroOpeningsByKey.set(identity.key, (zeroOpeningsByKey.get(identity.key) ?? 0) + 1);
      if (daysOpen !== null) {
        const list = daysOpenByKey.get(identity.key) ?? [];
        list.push(daysOpen);
        daysOpenByKey.set(identity.key, list);
      }
      recruiterOwnersByKey.set(identity.key, [...(recruiterOwnersByKey.get(identity.key) ?? []), identity.dm]);
    }
  }

  const melProjectsByKey = new Map<string, LiveMarketIntelligenceRow["melProjects"]>();
  if (melKeys.status && melKeys.state) {
    for (const row of input.melRows) {
      const identity = resolveMarketIdentity({
        city: cell(row, melCityKey) || cell(row, melKeys.storeName),
        state: cell(row, melKeys.state),
        manager: cell(row, melKeys.manager),
        source: "mel",
      });
      if (!identity.key) continue;
      const projects = melProjectsByKey.get(identity.key) ?? [];
      projects.push({
        projectNo: cell(row, melKeys.projectNo) || "—",
        projectName: cell(row, melKeys.projectName) || "Untitled project",
        storeCall: cell(row, melKeys.storeCall) || "—",
        status: cell(row, melKeys.status) || "—",
        rep: cell(row, melKeys.staffName) || (isCompletedStoreCallStatus(cell(row, melKeys.status)) ? "Completed" : "Open"),
      });
      melProjectsByKey.set(identity.key, projects);
    }
  }

  const candidatesByKey = new Map<string, CandidateIntelligenceRow[]>();
  for (const candidate of candidateSnapshot.rows) {
    const key = keyForCandidate(candidate);
    if (!key) continue;
    const list = candidatesByKey.get(key) ?? [];
    list.push(candidate);
    candidatesByKey.set(key, list);
  }

  const automationByKey = new Map<string, OpportunityAutomationRow[]>();
  for (const row of automation.rows) {
    const key = normalizeMarketKey(row.city, row.state);
    if (!key) continue;
    const list = automationByKey.get(key) ?? [];
    list.push(row);
    automationByKey.set(key, list);
  }

  const qualityByKey = new Map<string, { confidence: number; issues: string[] }>();
  for (const unmatched of dataQuality.topUnmatchedMarkets) {
    qualityByKey.set(unmatched.normalizedKey, {
      confidence: unmatched.avgConfidence,
      issues: unmatched.issueTypes,
    });
  }

  const markets = marketSnapshot.cities.map((market) => {
    const key = normalizeMarketKey(market.city, market.stateCode);
    const candidates = candidatesByKey.get(key) ?? [];
    const converted = candidates.filter(candidateConverted).length;
    const applicantVelocity = Math.round((candidates.filter((c) => (c.ageDays ?? 999) <= 7).length / 7) * 100) / 100;
    const candidatePipelineBreakdown = [...candidates.reduce((map, candidate) => {
      map.set(candidate.status, (map.get(candidate.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([status, count]) => ({ status, count }));
    const daysOpen = daysOpenByKey.get(key) ?? [];
    const averageDaysOpen =
      daysOpen.length > 0 ? Math.round(daysOpen.reduce((sum, days) => sum + days, 0) / daysOpen.length) : null;
    const totalOpenings = market.openRecruitingPosts;
    const zeroApplicantOpenings = zeroOpeningsByKey.get(key) ?? 0;
    const applicantConversionPercent =
      candidates.length > 0 ? Math.round((converted / candidates.length) * 1000) / 10 : 0;
    const noRecruiterAssigned = mode(recruiterOwnersByKey.get(key) ?? [], market.manager) === "Unassigned";
    const nearbyMarkets = marketSnapshot.cities.filter((row) => row.stateCode === market.stateCode && normalizeMarketKey(row.city, row.stateCode) !== key);
    const openOpportunitiesNearby = nearbyMarkets.reduce((sum, row) => sum + row.openStoreCalls, 0);
    const activeRepsNearby = Math.round((market.nearbyRepCoverageEstimate / 100) * Math.max(market.openStoreCalls, 1));

    const recruitingRiskScore = weightedScore([
      { value: zeroApplicantOpenings > 0 ? 100 : 0, weight: 0.3 },
      { value: averageDaysOpen === null ? 35 : Math.min(100, averageDaysOpen * 4), weight: 0.25 },
      { value: noRecruiterAssigned ? 90 : 0, weight: 0.15 },
      { value: applicantConversionPercent < 15 ? 75 : 20, weight: 0.15 },
      { value: market.applicants === 0 && totalOpenings > 0 ? 100 : 25, weight: 0.15 },
    ]);
    const staffingUrgencyScore = weightedScore([
      { value: market.marketRiskScore, weight: 0.35 },
      { value: market.openStoreCalls >= 5 ? 100 : market.openStoreCalls * 18, weight: 0.25 },
      { value: activeRepsNearby === 0 && market.openStoreCalls > 0 ? 100 : Math.max(0, 100 - market.nearbyRepCoverageEstimate), weight: 0.25 },
      { value: openOpportunitiesNearby >= 5 ? 80 : openOpportunitiesNearby * 12, weight: 0.15 },
    ]);
    const marketHealthScore = clamp(100 - weightedScore([
      { value: recruitingRiskScore, weight: 0.45 },
      { value: staffingUrgencyScore, weight: 0.45 },
      { value: dataQuality.averageConfidence < 75 ? 60 : 0, weight: 0.1 },
    ]));
    const status = marketStatus({
      marketHealthScore,
      totalOpenings,
      zeroApplicantOpenings,
      applicants: market.applicants,
      openStoreCalls: market.openStoreCalls,
      activeRepsNearby,
    });
    const recruiterOwner = mode(recruiterOwnersByKey.get(key) ?? [], "Unassigned");
    const rowRecommendations = recommendations({
      status,
      zeroApplicantOpenings,
      averageDaysOpen,
      recruiterOwner,
      openStoreCalls: market.openStoreCalls,
      applicants: market.applicants,
      applicantConversionPercent,
      activeRepsNearby,
      openOpportunitiesNearby,
      staffingUrgencyScore,
    });
    const quality = qualityByKey.get(key);

    return {
      key,
      market: market.label,
      city: market.city,
      state: market.stateCode,
      dmOwner: market.manager,
      recruiterOwner,
      totalOpenings,
      zeroApplicantOpenings,
      applicantVelocity,
      averageDaysOpen,
      recruitingRiskScore,
      staffingUrgencyScore,
      activeRepsNearby,
      openOpportunitiesNearby,
      marketHealthScore,
      status,
      applicantConversionPercent,
      candidatePipelineTotal: candidates.length,
      candidatePipelineBreakdown,
      automationRecommendations: automationByKey.get(key) ?? [],
      recommendations: rowRecommendations,
      dataQualityConfidence: quality?.confidence ?? dataQuality.averageConfidence,
      dataQualityIssues: quality?.issues ?? [],
      recruitingDetails: recruitingDetailsByKey.get(key) ?? [],
      melProjects: melProjectsByKey.get(key) ?? [],
      activityHistory: [
        { label: "Market scored", detail: `Health ${marketHealthScore}, recruiting risk ${recruitingRiskScore}` },
        { label: "Automation", detail: `${automationByKey.get(key)?.length ?? 0} recommendations available` },
      ],
    } satisfies LiveMarketIntelligenceRow;
  });

  markets.sort((a, b) => a.marketHealthScore - b.marketHealthScore || b.staffingUrgencyScore - a.staffingUrgencyScore);

  return {
    markets,
    byKey: Object.fromEntries(markets.map((market) => [market.key, market])),
    dataQuality,
  };
}
