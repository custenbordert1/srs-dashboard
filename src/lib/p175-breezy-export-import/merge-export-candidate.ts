import type { BreezyCandidate } from "@/lib/breezy-api";
import { isApiSourcedCandidate } from "@/lib/p175-breezy-export-import/normalize";
import type { BreezyExportNormalizedRow } from "@/lib/p175-breezy-export-import/types";

function preferNonEmpty(existing: string, incoming: string): string {
  const e = existing?.trim() ?? "";
  const i = incoming?.trim() ?? "";
  return e || i;
}

function preferEarlierDate(existing: string, incoming: string): string {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return existing <= incoming ? existing : incoming;
}

export function exportRowToBreezyCandidate(row: BreezyExportNormalizedRow): BreezyCandidate {
  return {
    candidateId: row.syntheticCandidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    source: row.source || "Breezy Export",
    stage: "Applied",
    appliedDate: row.appliedAt,
    createdDate: row.appliedAt,
    addedDate: row.appliedAt,
    updatedDate: row.lastActivityAt || row.appliedAt,
    addedDateSource: "breezy_export",
    positionId: row.positionId,
    positionName: row.positionName,
    city: row.city,
    state: row.state,
    zipCode: "",
    resumeText: "",
    hasResume: false,
    ingestionSource: "breezy_export",
    breezyCandidateIdUnavailable: true,
  };
}

export function mergeExportRowIntoCandidate(
  existing: BreezyCandidate,
  row: BreezyExportNormalizedRow,
): BreezyCandidate {
  const wasApi = isApiSourcedCandidate(existing);
  return {
    ...existing,
    firstName: preferNonEmpty(existing.firstName, row.firstName),
    lastName: preferNonEmpty(existing.lastName, row.lastName),
    email: preferNonEmpty(existing.email, row.email),
    phone: preferNonEmpty(existing.phone, row.phone),
    source: preferNonEmpty(existing.source, row.source),
    stage: preferNonEmpty(existing.stage, "Applied"),
    appliedDate: preferEarlierDate(existing.appliedDate, row.appliedAt),
    createdDate: preferEarlierDate(existing.createdDate, row.appliedAt),
    addedDate: preferEarlierDate(existing.addedDate, row.appliedAt),
    updatedDate: row.lastActivityAt || existing.updatedDate || row.appliedAt,
    addedDateSource: wasApi ? existing.addedDateSource : "breezy_export",
    positionId: preferNonEmpty(existing.positionId, row.positionId),
    positionName: preferNonEmpty(existing.positionName, row.positionName),
    city: preferNonEmpty(existing.city, row.city),
    state: preferNonEmpty(existing.state, row.state),
    ingestionSource: wasApi ? "merged" : existing.ingestionSource ?? "breezy_export",
    breezyCandidateIdUnavailable: wasApi ? false : existing.breezyCandidateIdUnavailable ?? true,
  };
}

export function tagApiCandidates(candidates: BreezyCandidate[]): BreezyCandidate[] {
  return candidates.map((candidate) => {
    if (candidate.ingestionSource) return candidate;
    if (candidate.addedDateSource === "breezy_export") return candidate;
    return {
      ...candidate,
      ingestionSource: "breezy_api" as const,
      breezyCandidateIdUnavailable: false,
    };
  });
}
