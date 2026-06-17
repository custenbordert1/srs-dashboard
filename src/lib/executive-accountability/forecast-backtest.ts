import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type {
  ExecutiveRecruitingForecastSnapshot,
  ForecastConfidenceLevel,
} from "@/lib/executive-recruiting-forecast";
import { forecastConfidenceLabel } from "@/lib/executive-recruiting-forecast";
import type {
  ForecastBacktestRow,
  ForecastBacktestSummary,
  ForecastHistoryEntry,
} from "@/lib/executive-accountability/types";
import { randomUUID } from "node:crypto";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_HISTORY_DAYS = 30;

export function countActiveReps(workflows: CandidateWorkflowState): number {
  let count = 0;
  for (const record of Object.values(workflows)) {
    if (record.workflowStatus === "Active Rep") count += 1;
  }
  return count;
}

export function captureForecastHistoryEntry(input: {
  forecast: ExecutiveRecruitingForecastSnapshot;
  activeRepCount: number;
  capturedAt: string;
}): ForecastHistoryEntry {
  return {
    id: randomUUID(),
    capturedAt: input.capturedAt,
    projectedHires30: input.forecast.kpis.projectedHires30,
    projectedHires60: input.forecast.kpis.projectedHires60,
    projectedHires90: input.forecast.kpis.projectedHires90,
    territoriesAtRisk: input.forecast.kpis.territoriesAtRisk,
    activeRepCount: input.activeRepCount,
    dataTrust: input.forecast.dataTrust,
    forecastConfidence: input.forecast.forecastConfidence,
  };
}

export function appendForecastHistory(
  history: ForecastHistoryEntry[],
  entry: ForecastHistoryEntry,
  maxEntries = 52,
): ForecastHistoryEntry[] {
  const last = history[history.length - 1];
  if (last && last.capturedAt.slice(0, 10) === entry.capturedAt.slice(0, 10)) {
    const replaced = [...history];
    replaced[replaced.length - 1] = entry;
    return replaced.slice(-maxEntries);
  }
  return [...history, entry].slice(-maxEntries);
}

function dataTrustLabel(level: string): string {
  if (level === "high") return "Healthy sync";
  if (level === "partial") return "Partial sync";
  return "Degraded";
}

function buildRow(
  entry: ForecastHistoryEntry,
  currentActiveRepCount: number,
  referenceMs: number,
): ForecastBacktestRow {
  const capturedMs = new Date(entry.capturedAt).getTime();
  const ageDays = Number.isNaN(capturedMs)
    ? 0
    : Math.floor((referenceMs - capturedMs) / MS_PER_DAY);

  if (ageDays < MIN_HISTORY_DAYS) {
    return {
      historyId: entry.id,
      capturedAt: entry.capturedAt,
      projectedHires30: entry.projectedHires30,
      actualActiveRepCount: null,
      deltaFromProjection: null,
      status: "pending",
      message: `Waiting ${MIN_HISTORY_DAYS - ageDays} more day(s) for 30-day comparison window`,
    };
  }

  const delta = Math.round((currentActiveRepCount - entry.activeRepCount) * 10) / 10;
  return {
    historyId: entry.id,
    capturedAt: entry.capturedAt,
    projectedHires30: entry.projectedHires30,
    actualActiveRepCount: delta,
    deltaFromProjection: Math.round((delta - entry.projectedHires30) * 10) / 10,
    status: "ready",
    message: `Active Rep net change vs projection: ${delta} actual vs ${entry.projectedHires30} projected`,
  };
}

export function buildForecastBacktestSummary(input: {
  history: ForecastHistoryEntry[];
  currentActiveRepCount: number;
  referenceMs?: number;
}): ForecastBacktestSummary {
  const referenceMs = input.referenceMs ?? Date.now();

  if (input.history.length === 0) {
    return {
      status: "not_enough_history",
      message: "Not enough history yet — forecast snapshots will accumulate on each accountability refresh.",
      rows: [],
    };
  }

  if (input.history.length < 2) {
    return {
      status: "not_enough_history",
      message: "Not enough history yet — at least two forecast snapshots are needed for comparison.",
      rows: input.history.map((entry) =>
        buildRow(entry, input.currentActiveRepCount, referenceMs),
      ),
    };
  }

  const rows = input.history
    .slice(-8)
    .map((entry) => buildRow(entry, input.currentActiveRepCount, referenceMs));
  const readyCount = rows.filter((row) => row.status === "ready").length;
  const pendingCount = rows.filter((row) => row.status === "pending").length;

  if (readyCount === 0) {
    return {
      status: "pending",
      message: "Not enough history yet — earliest snapshots are still inside the 30-day comparison window.",
      rows,
    };
  }

  return {
    status: readyCount === rows.length ? "ready" : "partial",
    message:
      readyCount === rows.length
        ? "Early backtest using Active Rep net change as a hire proxy — not a calibrated statistical model."
        : `${pendingCount} snapshot(s) still pending; ${readyCount} ready for comparison.`,
    rows,
  };
}

export function formatTrustAndConfidenceLabels(forecast: ExecutiveRecruitingForecastSnapshot): {
  dataTrustLabel: string;
  forecastConfidenceLabel: string;
} {
  return {
    dataTrustLabel: dataTrustLabel(forecast.dataTrust),
    forecastConfidenceLabel: forecastConfidenceLabel(
      forecast.forecastConfidence as ForecastConfidenceLevel,
    ),
  };
}
