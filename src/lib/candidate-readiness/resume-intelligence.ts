import type { BreezyCandidate } from "@/lib/breezy-api";
import { extractSkillTagsFromText } from "@/lib/recruiting-intelligence/skill-tags";
import { extractCandidateResumeText } from "@/lib/recruiting-intelligence/resume-parser";
import type { CandidateResumeIntelligence, ResumeSignalBadge } from "@/lib/candidate-readiness/types";
import { buildResumeQualityIndicators } from "@/lib/candidate-readiness/build-resume-quality";

const NOT_AVAILABLE = "Not available from Breezy yet.";

const SIGNAL_DEFINITIONS: Array<{ id: string; label: string; terms: string[] }> = [
  { id: "retail", label: "Retail experience", terms: ["retail", "store associate", "sales floor", "big box", "sales associate"] },
  { id: "customer_service", label: "Customer service", terms: ["customer service", "call center", "phone support", "client service", "guest service", "help desk"] },
  { id: "cash_handling", label: "Cash handling", terms: ["cash handling", "cash register", "pos", "checkout", "tender", "cashier"] },
  { id: "merchandising", label: "Merchandising", terms: ["merchandis", "reset", "planogram", "fixture", "display", "osa", "shelf set"] },
  { id: "travel", label: "Travel willingness", terms: ["travel", "mile", "radius", "multi-store", "route", "regional", "overnight"] },
  { id: "leadership", label: "Leadership", terms: ["supervisor", "team lead", "manager", "leadership", "coached", "shift lead", "trained new"] },
  { id: "scheduling", label: "Scheduling / appointments", terms: ["appointment", "scheduling", "calendar", "shift schedule", "booking", "set appointments"] },
];

const MERCH_RETAIL_TERMS = ["merchandis", "reset", "planogram", "retail", "walmart", "target", "grocery", "fixture", "display"];
const CUSTOMER_SERVICE_TERMS = ["customer service", "call center", "phone support", "client service", "guest service"];

function haystack(candidate: BreezyCandidate, resumeText: string): string {
  return `${resumeText} ${candidate.positionName} ${candidate.source}`.toLowerCase();
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function buildSignalBadges(text: string): ResumeSignalBadge[] {
  return SIGNAL_DEFINITIONS.map(({ id, label, terms }) => ({
    id,
    label,
    detected: hasAnyTerm(text, terms),
  }));
}

function buildSummary(candidate: BreezyCandidate, resumeText: string): string | null {
  const summary = candidate.resumeFields?.summary?.trim();
  if (summary) return summary;

  const headline = candidate.resumeFields?.headline?.trim();
  if (headline) return headline;

  const body = candidate.resumeFields?.resumeBody?.trim() || resumeText;
  if (!body) return null;

  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 320) return trimmed;
  return `${trimmed.slice(0, 317)}…`;
}

function extractWorkHistoryHighlights(candidate: BreezyCandidate, resumeText: string): string[] {
  const highlights: string[] = [];
  const workHistory = candidate.resumeFields?.workHistoryText?.trim();
  if (workHistory) {
    const chunks = workHistory.split(/\n|•|·|;/).map((part) => part.trim()).filter(Boolean);
    highlights.push(...chunks.slice(0, 6));
  }

  if (highlights.length === 0 && resumeText) {
    const lines = resumeText
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 8 && /[a-z]/i.test(line));
    highlights.push(...lines.slice(0, 4));
  }

  return highlights.slice(0, 6);
}

function detectEmploymentGaps(text: string): string[] {
  const yearMatches = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number.parseInt(match[0], 10));
  if (yearMatches.length < 2) return [];

  const uniqueYears = [...new Set(yearMatches)].sort((a, b) => a - b);
  const gaps: string[] = [];
  for (let index = 1; index < uniqueYears.length; index += 1) {
    const gap = uniqueYears[index] - uniqueYears[index - 1];
    if (gap > 1) {
      gaps.push(`Gap detected between ${uniqueYears[index - 1]} and ${uniqueYears[index]} (${gap - 1} year${gap - 1 === 1 ? "" : "s"})`);
    }
  }
  return gaps.slice(0, 3);
}

function buildExperienceFlags(
  badges: ResumeSignalBadge[],
  gaps: string[],
): string[] {
  const flags: string[] = [];
  for (const badge of badges.filter((entry) => entry.detected)) {
    flags.push(`${badge.label} detected`);
  }
  for (const gap of gaps) flags.push(gap);
  return flags;
}

function unavailableResume(): CandidateResumeIntelligence {
  return {
    available: false,
    summary: null,
    workHistoryHighlights: [],
    relevantSkills: [],
    signalBadges: SIGNAL_DEFINITIONS.map(({ id, label }) => ({ id, label, detected: false })),
    phoneCustomerServiceExperience: null,
    merchandisingRetailExperience: null,
    employmentGaps: [],
    experienceFlags: [NOT_AVAILABLE],
    quality: {
      employmentHistoryCount: null,
      longestTenureMonths: null,
      longestTenureLabel: null,
      employmentGapsDetected: 0,
      completeness: "unavailable",
      completenessLabel: NOT_AVAILABLE,
    },
  };
}

export function buildResumeIntelligence(candidate: BreezyCandidate): CandidateResumeIntelligence {
  const resumeText = extractCandidateResumeText(candidate);
  if (!candidate.hasResume && !resumeText) return unavailableResume();

  const text = haystack(candidate, resumeText);
  const skillTags = extractSkillTagsFromText(text);
  const gaps = detectEmploymentGaps(text);
  const signalBadges = buildSignalBadges(text);

  const phoneCustomerService = hasAnyTerm(text, CUSTOMER_SERVICE_TERMS) ? true : null;
  const merchandisingRetail = hasAnyTerm(text, MERCH_RETAIL_TERMS) ? true : null;
  const workHistoryHighlights = extractWorkHistoryHighlights(candidate, resumeText);

  return {
    available: true,
    summary: buildSummary(candidate, resumeText),
    workHistoryHighlights,
    relevantSkills: skillTags,
    signalBadges,
    phoneCustomerServiceExperience: phoneCustomerService,
    merchandisingRetailExperience: merchandisingRetail,
    employmentGaps: gaps,
    experienceFlags: buildExperienceFlags(signalBadges, gaps),
    quality: buildResumeQualityIndicators({
      candidate,
      resumeText,
      workHistoryHighlights,
      skillCount: skillTags.length,
      employmentGaps: gaps,
      available: true,
    }),
  };
}
