import type { ExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";
import { forecastConfidenceLabel } from "@/lib/executive-recruiting-forecast";
import type { ForecastHistoryEntry } from "@/lib/executive-accountability/types";

export type ForecastChangeLine = {
  label: string;
  before: string;
  after: string;
  direction: "improved" | "worsened" | "unchanged";
};

export type ForecastChangesSummary = {
  hasPriorSnapshot: boolean;
  lines: ForecastChangeLine[];
  improved: string[];
  worsened: string[];
};

function movementDirection(delta: number, higherIsWorse: boolean): "improved" | "worsened" | "unchanged" {
  if (delta === 0) return "unchanged";
  if (higherIsWorse) return delta > 0 ? "worsened" : "improved";
  return delta > 0 ? "improved" : "worsened";
}

function formatDelta(delta: number, suffix = ""): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}${suffix}`;
}

export function detectForecastChanges(input: {
  forecast: ExecutiveRecruitingForecastSnapshot;
  previousHistory: ForecastHistoryEntry | null;
}): ForecastChangesSummary {
  const prev = input.previousHistory;
  if (!prev) {
    return {
      hasPriorSnapshot: false,
      lines: [],
      improved: ["Baseline forecast snapshot captured — week-over-week comparison starts next refresh."],
      worsened: [],
    };
  }

  const lines: ForecastChangeLine[] = [];
  const improved: string[] = [];
  const worsened: string[] = [];

  const hireDelta =
    Math.round((input.forecast.kpis.projectedHires30 - prev.projectedHires30) * 10) / 10;
  if (hireDelta !== 0) {
    const direction = movementDirection(hireDelta, false);
    lines.push({
      label: "30-day hire forecast",
      before: String(prev.projectedHires30),
      after: String(input.forecast.kpis.projectedHires30),
      direction,
    });
    const text = `30-day hire forecast ${formatDelta(hireDelta)} (${prev.projectedHires30} → ${input.forecast.kpis.projectedHires30})`;
    if (direction === "improved") improved.push(text);
    else worsened.push(text);
  }

  const territoryDelta = input.forecast.kpis.territoriesAtRisk - prev.territoriesAtRisk;
  if (territoryDelta !== 0) {
    const direction = movementDirection(territoryDelta, true);
    lines.push({
      label: "Territories at risk",
      before: String(prev.territoriesAtRisk),
      after: String(input.forecast.kpis.territoriesAtRisk),
      direction,
    });
    const text = `Territories at risk ${formatDelta(territoryDelta)}`;
    if (direction === "improved") improved.push(text);
    else worsened.push(text);
  }

  const recruiterDelta =
    input.forecast.kpis.overloadedRecruiters - (prev.overloadedRecruiters ?? 0);
  if (recruiterDelta !== 0) {
    const direction = movementDirection(recruiterDelta, true);
    lines.push({
      label: "Overloaded recruiters",
      before: String(prev.overloadedRecruiters ?? 0),
      after: String(input.forecast.kpis.overloadedRecruiters),
      direction,
    });
    const text = `Overloaded recruiters ${formatDelta(recruiterDelta)}`;
    if (direction === "improved") improved.push(text);
    else worsened.push(text);
  }

  if (prev.dataTrust !== input.forecast.dataTrust) {
    lines.push({
      label: "Data trust",
      before: prev.dataTrust,
      after: input.forecast.dataTrust,
      direction:
        input.forecast.dataTrust === "high"
          ? "improved"
          : input.forecast.dataTrust === "degraded"
            ? "worsened"
            : "unchanged",
    });
    worsened.push(`Data trust moved from ${prev.dataTrust} to ${input.forecast.dataTrust}`);
  }

  if (prev.forecastConfidence !== input.forecast.forecastConfidence) {
    lines.push({
      label: "Forecast confidence (model)",
      before: forecastConfidenceLabel(prev.forecastConfidence),
      after: forecastConfidenceLabel(input.forecast.forecastConfidence),
      direction: "unchanged",
    });
    const text = `Forecast confidence ${forecastConfidenceLabel(prev.forecastConfidence)} → ${forecastConfidenceLabel(input.forecast.forecastConfidence)}`;
    if (input.forecast.forecastConfidence === "high" && prev.forecastConfidence !== "high") {
      improved.push(text);
    } else if (input.forecast.forecastConfidence === "low") {
      worsened.push(text);
    } else {
      worsened.push(text);
    }
  }

  if (lines.length === 0) {
    improved.push("No material forecast metric shifts since the prior snapshot.");
  }

  return { hasPriorSnapshot: true, lines, improved, worsened };
}
