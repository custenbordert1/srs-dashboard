import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  appliedOnSameDay,
  isApiSourcedCandidate,
  normalizeEmail,
  normalizePositionKey,
  normalizeText,
} from "@/lib/p175-breezy-export-import/normalize";
import type { BreezyExportNormalizedRow } from "@/lib/p175-breezy-export-import/types";

function positionMatchScore(exportPosition: string, candidatePosition: string): number {
  const a = normalizePositionKey(exportPosition);
  const b = normalizePositionKey(candidatePosition);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  return 0;
}

export function findStoreMatchForExportRow(input: {
  exportRow: BreezyExportNormalizedRow;
  candidates: BreezyCandidate[];
}): BreezyCandidate | null {
  const email = normalizeEmail(input.exportRow.email);
  const sameEmail = input.candidates.filter((c) => normalizeEmail(c.email ?? "") === email);
  if (sameEmail.length === 0) return null;

  let best: BreezyCandidate | null = null;
  let bestScore = 0;

  for (const candidate of sameEmail) {
    let score = 0;
    const posScore = positionMatchScore(input.exportRow.positionName, candidate.positionName ?? "");
    if (posScore === 0) continue;
    score += posScore;
    if (appliedOnSameDay(input.exportRow.appliedAt, candidate.appliedDate ?? candidate.addedDate)) {
      score += 50;
    }
    if (input.exportRow.positionId && candidate.positionId === input.exportRow.positionId) {
      score += 25;
    }
    if (isApiSourcedCandidate(candidate)) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (best && bestScore >= 80) return best;

  if (sameEmail.length === 1) {
    const only = sameEmail[0]!;
    if (positionMatchScore(input.exportRow.positionName, only.positionName ?? "") >= 80) {
      return only;
    }
  }

  return null;
}

export function buildEmailIndex(candidates: BreezyCandidate[]): Map<string, BreezyCandidate[]> {
  const index = new Map<string, BreezyCandidate[]>();
  for (const candidate of candidates) {
    const email = normalizeEmail(candidate.email ?? "");
    if (!email) continue;
    const list = index.get(email) ?? [];
    list.push(candidate);
    index.set(email, list);
  }
  return index;
}

export function nameMatchesQuery(name: string, query: string): boolean {
  return normalizeText(name).includes(normalizeText(query));
}
