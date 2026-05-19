import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AuthSession } from "@/lib/auth/types";
import { filterStatesForSession } from "@/lib/auth/permissions";

function stateSet(states: string[] | null): Set<string> | null {
  if (states === null) return null;
  return new Set(states.map(normalizeStateCode).filter(Boolean));
}

export function filterJobsByTerritory(jobs: BreezyJob[], allowed: Set<string> | null): BreezyJob[] {
  if (!allowed) return jobs;
  return jobs.filter((job) => allowed.has(normalizeStateCode(job.state)));
}

export function filterCandidatesByTerritory(
  candidates: BreezyCandidate[],
  allowed: Set<string> | null,
): BreezyCandidate[] {
  if (!allowed) return candidates;
  return candidates.filter((candidate) => allowed.has(normalizeStateCode(candidate.state)));
}

export function resolveTerritoryStateSet(
  session: AuthSession,
  requestedStates?: string[],
): Set<string> | null {
  const states = filterStatesForSession(session, requestedStates);
  return stateSet(states);
}

export function applyTerritoryToJobs(
  session: AuthSession,
  jobs: BreezyJob[],
  requestedStates?: string[],
): BreezyJob[] {
  return filterJobsByTerritory(jobs, resolveTerritoryStateSet(session, requestedStates));
}

export function applyTerritoryToCandidates(
  session: AuthSession,
  candidates: BreezyCandidate[],
  requestedStates?: string[],
): BreezyCandidate[] {
  return filterCandidatesByTerritory(candidates, resolveTerritoryStateSet(session, requestedStates));
}
