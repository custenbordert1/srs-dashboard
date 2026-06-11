import { canAccessTerritory } from "@/lib/auth/permissions";
import { isDmRole } from "@/lib/auth/roles";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import type { AuthSession } from "@/lib/auth/types";
import type { BreezyCandidate } from "@/lib/breezy-api";

export function findCandidateInList(
  candidates: BreezyCandidate[],
  candidateId: string,
): BreezyCandidate | null {
  return candidates.find((row) => row.candidateId === candidateId) ?? null;
}

export function isCandidateInSessionTerritory(
  session: AuthSession,
  candidate: Pick<BreezyCandidate, "state"> | null | undefined,
): boolean {
  if (!candidate) return false;
  const scoped = refreshSessionTerritories(session);
  return canAccessTerritory(scoped, candidate.state);
}

export function dmRequiresCandidateTerritoryCheck(session: AuthSession): boolean {
  return isDmRole(session.role);
}
