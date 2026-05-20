import {
  BREEZY_ADDED_DATE_TIMEZONE,
  calendarDateKeyInTimezone,
  countCandidatesLast7Days,
  isPartialBreezyPositionSync,
  type BreezyCandidate,
  type BreezyCandidatesSuccess,
} from "@/lib/breezy-api";
import type { Kpi } from "@/lib/recruiting-sample-data";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BreezyCountBucket = {
  label: string;
  count: number;
};

export type BreezyRecentCandidateRow = {
  candidateId: string;
  name: string;
  source: string;
  stage: string;
  position: string;
  location: string;
  appliedDate: string;
  appliedDateLabel: string;
};

export type BreezyCandidateSummary = {
  totalCandidates: number;
  last24Hours: number;
  last7Days: number;
  positionsScanned: number;
  totalPositionsAvailable: number;
  partialPositionSync: boolean;
  fetchedAt: string;
  fetchedAtLabel: string;
  bySource: BreezyCountBucket[];
  byStage: BreezyCountBucket[];
  newestCandidates: BreezyRecentCandidateRow[];
  truncated: boolean;
  kpis: Kpi[];
};

function parseAppliedDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function candidateName(candidate: BreezyCandidate): string {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  return name || candidate.email || "Unknown candidate";
}

function formatAppliedDate(raw: string): string {
  const date = parseAppliedDate(raw);
  if (!date) return raw.trim() || "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function countBuckets(candidates: BreezyCandidate[], field: "source" | "stage"): BreezyCountBucket[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const raw = field === "source" ? candidate.source : candidate.stage;
    const label = raw.trim() || (field === "source" ? "Unknown source" : "Unknown stage");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

function bucketHint(buckets: BreezyCountBucket[], limit = 4): string {
  if (buckets.length === 0) return "No candidates in pull";
  return buckets
    .slice(0, limit)
    .map((row) => `${row.label}: ${row.count.toLocaleString()}`)
    .join(" · ");
}

function countAppliedSince(candidates: BreezyCandidate[], since: Date): number {
  return candidates.filter((candidate) => {
    const applied = parseAppliedDate(candidate.appliedDate);
    return applied !== null && applied >= since;
  }).length;
}

function buildNewestCandidates(candidates: BreezyCandidate[], limit = 10): BreezyRecentCandidateRow[] {
  return [...candidates]
    .sort((a, b) => {
      const aDate = parseAppliedDate(a.appliedDate);
      const bDate = parseAppliedDate(b.appliedDate);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return bDate.getTime() - aDate.getTime();
    })
    .slice(0, limit)
    .map((candidate) => {
      const city = candidate.city.trim();
      const state = candidate.state.trim();
      const location = [city, state].filter(Boolean).join(", ") || "—";
      return {
        candidateId: candidate.candidateId,
        name: candidateName(candidate),
        source: candidate.source.trim() || "—",
        stage: candidate.stage.trim() || "—",
        position: candidate.positionName.trim() || "—",
        location,
        appliedDate: candidate.appliedDate,
        appliedDateLabel: formatAppliedDate(candidate.appliedDate),
      };
    });
}

function flatKpi(
  id: string,
  label: string,
  value: string,
  hint: string,
): Kpi {
  return {
    id,
    label,
    value,
    change: "—",
    changeDirection: "flat",
    hint,
  };
}

export function buildBreezyCandidateSummary(data: BreezyCandidatesSuccess): BreezyCandidateSummary {
  const {
    candidates,
    fetchedAt,
    positionsScanned = 0,
    totalPositionsAvailable = positionsScanned,
    candidatesLast7Days,
  } = data;
  const partialPositionSync = isPartialBreezyPositionSync(data);
  const syncTime = new Date(fetchedAt);
  const syncMs = Number.isNaN(syncTime.getTime()) ? Date.now() : syncTime.getTime();
  const since24h = new Date(syncMs - MS_PER_DAY);
  const last7EndKey = calendarDateKeyInTimezone(syncTime, BREEZY_ADDED_DATE_TIMEZONE);

  const totalCandidates = candidates.length;
  const last24Hours = countAppliedSince(candidates, since24h);
  const last7Days = candidatesLast7Days ?? countCandidatesLast7Days(candidates, fetchedAt);
  const customRangeCount =
    data.dateRangeStart && data.dateRangeEnd ? (data.candidatesInDateRange ?? 0) : undefined;
  const bySource = countBuckets(candidates, "source");
  const byStage = countBuckets(candidates, "stage");
  const newestCandidates = buildNewestCandidates(candidates);
  const fetchedAtLabel = formatFetchedAt(fetchedAt);

  const topSource = bySource[0];
  const topStage = byStage[0];

  const kpis: Kpi[] = [
    flatKpi(
      "breezy-total",
      "Total candidates pulled",
      totalCandidates.toLocaleString(),
      "All candidates returned by the current Breezy sync",
    ),
    flatKpi(
      "breezy-24h",
      "Candidates last 24 hours",
      last24Hours.toLocaleString(),
      `Applied on or after ${formatAppliedDate(since24h.toISOString())} (relative to last sync)`,
    ),
    flatKpi(
      "breezy-7d",
      "Candidates last 7 days",
      last7Days.toLocaleString(),
      `Added Date in last 7 calendar days ending ${last7EndKey} (${BREEZY_ADDED_DATE_TIMEZONE})`,
    ),
    ...(customRangeCount !== undefined && data.dateRangeStart && data.dateRangeEnd
      ? [
          flatKpi(
            "breezy-range",
            `Added ${data.dateRangeStart} – ${data.dateRangeEnd}`,
            customRangeCount.toLocaleString(),
            "Matches Breezy custom Added Date range (creation_date)",
          ),
        ]
      : []),
    flatKpi(
      "breezy-source",
      "Candidates by source",
      topSource ? topSource.count.toLocaleString() : "0",
      topSource ? `${topSource.label} · ${bucketHint(bySource)}` : bucketHint(bySource),
    ),
    flatKpi(
      "breezy-stage",
      "Candidates by stage",
      topStage ? topStage.count.toLocaleString() : "0",
      topStage ? `${topStage.label} · ${bucketHint(byStage)}` : bucketHint(byStage),
    ),
    flatKpi(
      "breezy-positions",
      "Positions scanned",
      `${positionsScanned.toLocaleString()} / ${totalPositionsAvailable.toLocaleString()}`,
      partialPositionSync
        ? "Not all published positions were scanned"
        : "All published positions included in this pull",
    ),
    flatKpi("breezy-sync", "Last sync time", fetchedAtLabel, "Breezy candidates API fetchedAt timestamp"),
  ];

  return {
    totalCandidates,
    last24Hours,
    last7Days,
    positionsScanned,
    totalPositionsAvailable,
    partialPositionSync,
    fetchedAt,
    fetchedAtLabel,
    bySource,
    byStage,
    newestCandidates,
    truncated: partialPositionSync,
    kpis,
  };
}
