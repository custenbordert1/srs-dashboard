import { createHash } from "node:crypto";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { BreezyJob } from "@/lib/breezy-api";
import type { BreezyExportNormalizedRow } from "@/lib/p175-breezy-export-import/types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/‚Äì/g, "–")
    .replace(/‚Äô/g, "'")
    .replace(/‚Äú|‚Äù/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizePositionKey(value: string): string {
  return normalizeText(value).replace(/[—–]/g, "-");
}

export function parsePersonName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space <= 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

export function parseLocation(location: string): { city: string; state: string } {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: "", state: "" };
  if (parts.length === 1) {
    const state = normalizeStateCode(parts[0]!);
    return { city: state ? "" : parts[0]!, state: state ?? "" };
  }
  const state = normalizeStateCode(parts[parts.length - 1]!) ?? parts[parts.length - 1]!;
  const city = parts.slice(0, -1).join(", ");
  return { city, state };
}

export function excelDateToIso(serial: number, timeFrac = 0): string {
  if (!serial || !Number.isFinite(serial)) return "";
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (timeFrac) {
    const secs = Math.round(timeFrac * 86400);
    d.setUTCHours(0, 0, 0, 0);
    d.setTime(d.getTime() + secs * 1000);
  }
  return d.toISOString();
}

export function exportSyntheticCandidateId(input: {
  email: string;
  positionName: string;
  appliedAt: string;
}): string {
  const key = [
    normalizeEmail(input.email),
    normalizePositionKey(input.positionName),
    input.appliedAt.slice(0, 10),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export function buildPositionMatcher(jobs: BreezyJob[]): (positionName: string) => BreezyJob | null {
  const byExact = new Map<string, BreezyJob>();
  for (const job of jobs) {
    byExact.set(normalizePositionKey(job.name), job);
  }
  const allJobs = [...jobs];

  return (positionName: string) => {
    const key = normalizePositionKey(positionName);
    if (!key) return null;
    const exact = byExact.get(key);
    if (exact) return exact;
    const contains = allJobs.filter((job) => {
      const jobKey = normalizePositionKey(job.name);
      return jobKey.includes(key) || key.includes(jobKey);
    });
    if (contains.length === 1) return contains[0]!;
    return null;
  };
}

export function appliedOnSameDay(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

export function isExportSourcedCandidate(candidate: {
  ingestionSource?: string;
  addedDateSource?: string;
  breezyCandidateIdUnavailable?: boolean;
}): boolean {
  if (candidate.ingestionSource === "breezy_export") return true;
  if (candidate.addedDateSource === "breezy_export") return true;
  return candidate.breezyCandidateIdUnavailable === true;
}

export function isApiSourcedCandidate(candidate: {
  ingestionSource?: string;
  addedDateSource?: string;
  breezyCandidateIdUnavailable?: boolean;
}): boolean {
  if (candidate.ingestionSource === "breezy_api" || candidate.ingestionSource === "merged") {
    return true;
  }
  if (isExportSourcedCandidate(candidate)) return false;
  return Boolean(candidate.addedDateSource && candidate.addedDateSource !== "breezy_export");
}

export function normalizeExportApplicantRow(input: {
  rowNumber: number;
  raw: Record<string, unknown>;
  matchPosition: (positionName: string) => BreezyJob | null;
}): BreezyExportNormalizedRow | { skipReason: string } {
  const email = normalizeEmail(String(input.raw.email_address ?? ""));
  if (!email || !email.includes("@")) {
    return { skipReason: "Missing or invalid email_address." };
  }

  const name = String(input.raw.name ?? "").trim();
  const { firstName, lastName } = parsePersonName(name);
  const positionName = String(input.raw.position ?? "").trim();
  const addedDate = Number(input.raw.addedDate ?? 0);
  const addedTime = Number(input.raw.addedTime ?? 0);
  const appliedAt = excelDateToIso(addedDate, addedTime);
  if (!appliedAt) {
    return { skipReason: "Missing or invalid addedDate." };
  }

  const lastActivityDate = Number(input.raw.lastActivityDate ?? 0);
  const lastActivityTime = Number(input.raw.lastActivityTime ?? 0);
  const lastActivityAt = excelDateToIso(lastActivityDate, lastActivityTime);

  const location = String(input.raw.location ?? "");
  const { city, state } = parseLocation(location);
  const job = input.matchPosition(positionName);

  return {
    rowNumber: input.rowNumber,
    name,
    firstName,
    lastName,
    email,
    phone: String(input.raw.phone_number ?? "").trim(),
    positionName,
    positionId: job?.jobId ?? "",
    city,
    state,
    source: String(input.raw.source ?? "").trim(),
    recruiter: String(input.raw.sourced_by_name ?? "").trim(),
    appliedAt,
    lastActivityAt: lastActivityAt || appliedAt,
    syntheticCandidateId: exportSyntheticCandidateId({ email, positionName, appliedAt }),
  };
}
