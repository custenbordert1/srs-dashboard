import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ResumeQualityIndicators } from "@/lib/candidate-readiness/types";

const UNAVAILABLE: ResumeQualityIndicators = {
  employmentHistoryCount: null,
  longestTenureMonths: null,
  longestTenureLabel: null,
  employmentGapsDetected: 0,
  completeness: "unavailable",
  completenessLabel: "Not available from Breezy yet.",
};

function countEmploymentEntries(workHistoryText: string, highlightCount: number): number {
  if (workHistoryText.trim()) {
    const lines = workHistoryText
      .split(/\n|•|·|;/)
      .map((part) => part.trim())
      .filter((part) => part.length > 4);
    if (lines.length > 0) return lines.length;
  }
  return highlightCount > 0 ? highlightCount : 0;
}

function formatTenure(months: number): string {
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const remainder = months % 12;
    if (remainder === 0) return `${years} year${years === 1 ? "" : "s"}`;
    return `${years}y ${remainder}m`;
  }
  return `${months} month${months === 1 ? "" : "s"}`;
}

function parseLongestTenure(text: string): { months: number; label: string } | null {
  const pattern = /\b(19|20\d{2})\s*(?:[-–—]|to|through)\s*((?:19|20)\d{2}|present|current|now)\b/gi;
  let maxMonths = 0;
  const currentYear = new Date().getFullYear();

  for (const match of text.matchAll(pattern)) {
    const startYear = Number.parseInt(match[1] ?? "", 10);
    const endToken = (match[2] ?? "").toLowerCase();
    const endYear = /present|current|now/.test(endToken)
      ? currentYear
      : Number.parseInt(endToken, 10);
    if (Number.isNaN(startYear) || Number.isNaN(endYear) || endYear < startYear) continue;
    maxMonths = Math.max(maxMonths, (endYear - startYear) * 12);
  }

  if (maxMonths === 0) return null;
  return { months: maxMonths, label: formatTenure(maxMonths) };
}

function assessCompleteness(input: {
  resumeText: string;
  hasSummary: boolean;
  historyCount: number;
  skillCount: number;
  hasPhone: boolean;
}): Pick<ResumeQualityIndicators, "completeness" | "completenessLabel"> {
  const length = input.resumeText.trim().length;
  if (length === 0) return UNAVAILABLE;

  const sections = [
    input.hasSummary,
    input.historyCount > 0,
    input.skillCount > 0,
    input.hasPhone,
  ].filter(Boolean).length;

  if (length < 80 || sections <= 1) {
    return { completeness: "minimal", completenessLabel: "Minimal resume detail" };
  }
  if (sections >= 3 && input.historyCount >= 2) {
    return { completeness: "complete", completenessLabel: "Complete resume profile" };
  }
  return { completeness: "partial", completenessLabel: "Partial resume profile" };
}

export function buildResumeQualityIndicators(input: {
  candidate: BreezyCandidate;
  resumeText: string;
  workHistoryHighlights: string[];
  skillCount: number;
  employmentGaps: string[];
  available: boolean;
}): ResumeQualityIndicators {
  if (!input.available) return UNAVAILABLE;

  const workHistoryText = input.candidate.resumeFields?.workHistoryText ?? "";
  const historyCount = countEmploymentEntries(workHistoryText, input.workHistoryHighlights.length);
  const tenure = parseLongestTenure(`${input.resumeText} ${workHistoryText}`);
  const completeness = assessCompleteness({
    resumeText: input.resumeText,
    hasSummary: Boolean(input.candidate.resumeFields?.summary?.trim() || input.candidate.resumeFields?.headline?.trim()),
    historyCount,
    skillCount: input.skillCount,
    hasPhone: Boolean(input.candidate.phone?.trim()),
  });

  return {
    employmentHistoryCount: historyCount,
    longestTenureMonths: tenure?.months ?? null,
    longestTenureLabel: tenure?.label ?? null,
    employmentGapsDetected: input.employmentGaps.length,
    ...completeness,
  };
}
