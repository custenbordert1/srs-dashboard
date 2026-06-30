import type { BreezyCandidate } from "@/lib/breezy-api";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { TestCohortApplicant } from "@/lib/test-cohort-validation/types";
import { normalizePhoneDigits } from "@/lib/test-cohort-validation/validate-cohort-contact";

export type ApplicantMatchCandidate = {
  candidate: BreezyCandidate;
  score: number;
  signals: string[];
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePositionTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function candidateFullName(candidate: BreezyCandidate): string {
  return normalizeName(`${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim());
}

function positionTitleMatches(applicantTitle: string, candidateTitle: string | undefined): boolean {
  if (!candidateTitle?.trim()) return false;
  const a = normalizePositionTitle(applicantTitle);
  const b = normalizePositionTitle(candidateTitle);
  return a === b || a.includes(b) || b.includes(a);
}

export function scoreApplicantMatch(
  applicant: TestCohortApplicant,
  candidate: BreezyCandidate,
): ApplicantMatchCandidate {
  let score = 0;
  const signals: string[] = [];

  const applicantEmail = normalizeEmail(applicant.email);
  const candidateEmail = normalizeEmail(candidate.email ?? "");
  if (applicantEmail && candidateEmail && applicantEmail === candidateEmail) {
    score += 100;
    signals.push("email");
  }

  const applicantPhone = normalizePhoneDigits(applicant.phone);
  const candidatePhone = normalizePhoneDigits(candidate.phone ?? "");
  if (applicantPhone && candidatePhone && applicantPhone === candidatePhone) {
    score += 40;
    signals.push("phone");
  }

  const applicantName = normalizeName(applicant.name);
  const candidateName = candidateFullName(candidate);
  if (applicantName && candidateName && applicantName === candidateName) {
    score += 30;
    signals.push("name");
  } else if (
    applicantName &&
    candidateName &&
    (candidateName.includes(applicantName) || applicantName.includes(candidateName))
  ) {
    score += 15;
    signals.push("name_partial");
  }

  const applicantCity = normalizeCity(applicant.city);
  const candidateCity = normalizeCity(candidate.city ?? "");
  const applicantState = normalizeStateCode(applicant.state);
  const candidateState = normalizeStateCode(candidate.state ?? "");
  if (applicantCity && candidateCity && applicantCity === candidateCity) {
    score += 10;
    signals.push("city");
  }
  if (applicantState && candidateState && applicantState === candidateState) {
    score += 5;
    signals.push("state");
  }

  if (positionTitleMatches(applicant.positionTitle, candidate.positionName)) {
    score += 20;
    signals.push("position_title");
  }

  return { candidate, score, signals };
}

const MATCH_THRESHOLD = 100;

export function matchTestApplicantToCandidates(
  applicant: TestCohortApplicant,
  candidates: BreezyCandidate[],
): ApplicantMatchCandidate[] {
  return candidates
    .map((candidate) => scoreApplicantMatch(applicant, candidate))
    .filter((match) => match.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

export function resolveBestApplicantMatch(
  applicant: TestCohortApplicant,
  candidates: BreezyCandidate[],
): { best: ApplicantMatchCandidate | null; ambiguous: boolean } {
  const matches = matchTestApplicantToCandidates(applicant, candidates);
  if (matches.length === 0) return { best: null, ambiguous: false };
  if (matches.length === 1) return { best: matches[0]!, ambiguous: false };
  const top = matches[0]!;
  const runnerUp = matches[1]!;
  if (top.score === runnerUp.score) {
    return { best: top, ambiguous: true };
  }
  return { best: top, ambiguous: false };
}
