import { canAccessTerritory } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import {
  getCorrelation,
  type ExecutionCorrelation,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";

export type PlacementGuardFailure = {
  ok: false;
  error: string;
  status: 400 | 403 | 404 | 502;
};

export type PlacementGuardSuccess = {
  ok: true;
  correlation: ExecutionCorrelation;
};

export type PlacementGuardResult = PlacementGuardFailure | PlacementGuardSuccess;

export function validatePlacementCorrelationAccess(
  session: AuthSession,
  correlation: ExecutionCorrelation,
  candidates: BreezyCandidate[],
): PlacementGuardResult {
  if (correlation.type !== "placement") {
    return {
      ok: false,
      error: "Correlation is not a placement recommendation.",
      status: 400,
    };
  }

  if (correlation.candidateId) {
    const allowed = applyTerritoryToCandidates(session, candidates);
    if (!allowed.some((row) => row.candidateId === correlation.candidateId)) {
      return {
        ok: false,
        error: "Placement correlation is outside your permitted territory.",
        status: 403,
      };
    }
    return { ok: true, correlation };
  }

  if (correlation.state && !canAccessTerritory(session, correlation.state)) {
    return {
      ok: false,
      error: "Placement correlation is outside your permitted territory.",
      status: 403,
    };
  }

  if (!correlation.state) {
    return {
      ok: false,
      error: "Placement correlation is missing territory scope.",
      status: 400,
    };
  }

  return { ok: true, correlation };
}

export async function guardPlacementCorrelationMutation(
  session: AuthSession,
  correlationId: string,
  candidates?: BreezyCandidate[],
): Promise<PlacementGuardResult> {
  const correlation = await getCorrelation(correlationId);
  if (!correlation) {
    return { ok: false, error: "Correlation not found.", status: 404 };
  }

  let scopedCandidates = candidates;
  if (!scopedCandidates) {
    const candidatesResult = await fetchBreezyCandidates();
    if (!candidatesResult.ok) {
      return { ok: false, error: candidatesResult.error, status: 502 };
    }
    scopedCandidates = candidatesResult.candidates;
  }

  return validatePlacementCorrelationAccess(session, correlation, scopedCandidates);
}
