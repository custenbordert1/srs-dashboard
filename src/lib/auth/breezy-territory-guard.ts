import {
  countCandidatesLast7Days,
  type BreezyCandidatesResult,
  type BreezyJobsResult,
} from "@/lib/breezy-api";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";

export function guardBreezyJobsResult(result: BreezyJobsResult, session: AuthSession | null): BreezyJobsResult {
  if (!session || !result.ok) return result;
  if (session.role === "executive" || session.role === "recruiter") return result;
  return {
    ...result,
    jobs: applyTerritoryToJobs(session, result.jobs),
  };
}

export function guardBreezyCandidatesResult(
  result: BreezyCandidatesResult,
  session: AuthSession | null,
): BreezyCandidatesResult {
  if (!session || !result.ok) return result;
  if (session.role === "executive" || session.role === "recruiter") return result;
  const candidates = applyTerritoryToCandidates(session, result.candidates);
  return {
    ...result,
    candidates,
    totalCandidatesPulled: candidates.length,
    candidatesLast7Days: countCandidatesLast7Days(candidates, result.fetchedAt),
  };
}
