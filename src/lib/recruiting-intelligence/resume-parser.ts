import type { BreezyCandidate } from "@/lib/breezy-api";
import { extractSkillTagsFromText } from "@/lib/recruiting-intelligence/skill-tags";
import type { CandidateSkillTagId } from "@/lib/recruiting-intelligence/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function collectWorkHistoryText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const parts: string[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    parts.push(
      stringFromUnknown(record.title),
      stringFromUnknown(record.company),
      stringFromUnknown(record.summary),
      stringFromUnknown(record.description),
    );
  }
  return parts.filter(Boolean).join(" ");
}

function collectCustomAttributesText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const parts: string[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    parts.push(stringFromUnknown(record.name), stringFromUnknown(record.value));
  }
  return parts.filter(Boolean).join(" ");
}

/** Extract resume/application text from sanitized Breezy candidate fields (read-only sync). */
export function extractCandidateResumeText(candidate: BreezyCandidate): string {
  if (candidate.resumeText?.trim()) return candidate.resumeText.trim();

  const embedded = candidate.resumeFields;
  if (!embedded) return "";

  const parts = [
    embedded.headline,
    embedded.summary,
    embedded.coverLetter,
    embedded.workHistoryText,
    embedded.educationText,
    embedded.resumeBody,
    embedded.tags?.join(" "),
    embedded.customAttributesText,
  ].filter(Boolean);

  return parts.join("\n").trim();
}

export function candidateHasResume(candidate: BreezyCandidate, resumeText: string): boolean {
  if (candidate.hasResume === true) return true;
  const trimmed = resumeText.trim();
  if (trimmed.length >= 80) return true;
  if (trimmed.length >= 40 && extractSkillTagsFromText(trimmed).length >= 2) return true;
  return false;
}

export function parseCandidateApplication(
  candidate: BreezyCandidate,
): { resumeText: string; hasResume: boolean; skillTags: CandidateSkillTagId[] } {
  const resumeText = extractCandidateResumeText(candidate);
  const profileHaystack = [
    candidate.firstName,
    candidate.lastName,
    candidate.email,
    candidate.positionName,
    candidate.source,
    candidate.stage,
  ].join(" ");
  const combined = `${profileHaystack} ${resumeText}`.trim();
  const skillTags = extractSkillTagsFromText(combined);
  const hasResume = candidateHasResume(candidate, resumeText);

  return { resumeText, hasResume, skillTags };
}

/** Parse raw Breezy candidate payload fields at sync time (no extra API calls). */
export function extractResumeFieldsFromRaw(raw: Record<string, unknown>): BreezyCandidate["resumeFields"] {
  const headline = stringFromUnknown(raw.headline);
  const summary = stringFromUnknown(raw.summary) || stringFromUnknown(raw.bio);
  const coverLetter = stringFromUnknown(raw.cover_letter) || stringFromUnknown(raw.coverLetter);
  const resumeBody =
    stringFromUnknown(raw.resume) ||
    stringFromUnknown(raw.resume_text) ||
    stringFromUnknown(raw.cv) ||
    stringFromUnknown(raw.profile_text);
  const workHistoryText = collectWorkHistoryText(raw.work_history ?? raw.experience);
  const educationText = collectWorkHistoryText(raw.education);
  const customAttributesText = collectCustomAttributesText(raw.custom_attributes);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => stringFromUnknown(tag)).filter(Boolean)
    : [];

  const hasContent =
    Boolean(headline || summary || coverLetter || resumeBody || workHistoryText || educationText || customAttributesText);

  if (!hasContent && tags.length === 0) return undefined;

  return {
    headline,
    summary,
    coverLetter,
    resumeBody,
    workHistoryText,
    educationText,
    customAttributesText,
    tags,
  };
}

export function extractZipFromRaw(raw: Record<string, unknown>): string {
  const direct =
    stringFromUnknown(raw.postal_code) ||
    stringFromUnknown(raw.zip) ||
    stringFromUnknown(raw.zip_code) ||
    stringFromUnknown(raw.postalCode);
  if (direct) return normalizeZip(direct);

  const address = asRecord(raw.address) ?? asRecord(raw.location);
  if (address) {
    const nested = stringFromUnknown(address.postal_code) || stringFromUnknown(address.zip);
    if (nested) return normalizeZip(nested);
  }
  return "";
}

export function normalizeZip(raw: string): string {
  const match = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match?.[1] ?? "";
}
