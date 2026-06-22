import type { BreezyCandidate } from "@/lib/breezy-api";
import { extractSkillTagsFromText } from "@/lib/recruiting-intelligence/skill-tags";
import { extractCandidateResumeText } from "@/lib/recruiting-intelligence/resume-parser";
import type { CandidateResumeIntelligence } from "@/lib/candidate-readiness/types";

const NOT_AVAILABLE = "Not available from Breezy yet.";

const CUSTOMER_SERVICE_TERMS = ["customer service", "call center", "phone support", "client service", "guest service"];
const MERCH_RETAIL_TERMS = ["merchandis", "reset", "planogram", "retail", "walmart", "target", "grocery", "fixture", "display"];
const PHONE_TERMS = ["phone", "call center", "telephone", "inbound", "outbound"];

function haystack(candidate: BreezyCandidate, resumeText: string): string {
  return `${resumeText} ${candidate.positionName} ${candidate.source}`.toLowerCase();
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
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
  text: string,
  phoneCustomerService: boolean | null,
  merchandisingRetail: boolean | null,
  gaps: string[],
): string[] {
  const flags: string[] = [];
  if (phoneCustomerService) flags.push("Phone/customer service experience detected");
  if (merchandisingRetail) flags.push("Merchandising/retail experience detected");
  if (phoneCustomerService === false && hasAnyTerm(text, PHONE_TERMS)) {
    flags.push("Phone experience mentioned — verify comfort level");
  }
  if (merchandisingRetail === false && hasAnyTerm(text, MERCH_RETAIL_TERMS)) {
    flags.push("Retail keywords present — confirm merchandising depth");
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
    phoneCustomerServiceExperience: null,
    merchandisingRetailExperience: null,
    employmentGaps: [],
    experienceFlags: [NOT_AVAILABLE],
  };
}

export function buildResumeIntelligence(candidate: BreezyCandidate): CandidateResumeIntelligence {
  const resumeText = extractCandidateResumeText(candidate);
  if (!candidate.hasResume && !resumeText) return unavailableResume();

  const text = haystack(candidate, resumeText);
  const skillTags = extractSkillTagsFromText(text);
  const gaps = detectEmploymentGaps(text);

  const phoneCustomerService = hasAnyTerm(text, CUSTOMER_SERVICE_TERMS) || hasAnyTerm(text, PHONE_TERMS)
    ? true
    : null;
  const merchandisingRetail = hasAnyTerm(text, MERCH_RETAIL_TERMS) ? true : null;

  return {
    available: true,
    summary: buildSummary(candidate, resumeText),
    workHistoryHighlights: extractWorkHistoryHighlights(candidate, resumeText),
    relevantSkills: skillTags,
    phoneCustomerServiceExperience: phoneCustomerService,
    merchandisingRetailExperience: merchandisingRetail,
    employmentGaps: gaps,
    experienceFlags: buildExperienceFlags(text, phoneCustomerService, merchandisingRetail, gaps),
  };
}
