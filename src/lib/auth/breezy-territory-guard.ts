import {
  countCandidatesInDateRange,
  countCandidatesInRangeForPipelineStatus,
  countCandidatesLast7Days,
  type BreezyCandidatesDebugResult,
  type BreezyCandidatesResult,
  type BreezyJobsResult,
} from "@/lib/breezy-api";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { maskCandidatePii } from "@/lib/security/mask-pii";

export function guardBreezyJobsResult(result: BreezyJobsResult, session: AuthSession | null): BreezyJobsResult {
  if (!session || !result.ok) return result;
  if (session.role === "executive" || session.role === "recruiter") return result;
  return {
    ...result,
    jobs: applyTerritoryToJobs(session, result.jobs),
  };
}

function guardBreezyCandidatesSuccess<T extends BreezyCandidatesResult & { ok: true }>(
  result: T,
  session: AuthSession,
): T {
  const beforeCount = result.candidates.length;
  const candidates = applyTerritoryToCandidates(session, result.candidates).map((candidate) =>
    maskCandidatePii(candidate, session.role),
  );
  const territoryFiltered = Math.max(0, beforeCount - candidates.length);
  const skippedCandidatesReason = result.skippedCandidatesReason
    ? {
        ...result.skippedCandidatesReason,
        territoryFiltered,
      }
    : undefined;

  return {
    ...result,
    candidates,
    totalCandidatesPulled: candidates.length,
    totalCandidatesFetched: candidates.length,
    candidatesLast7Days: countCandidatesLast7Days(candidates, result.fetchedAt),
    candidatesInDateRange:
      result.dateRangeStart && result.dateRangeEnd
        ? countCandidatesInDateRange(candidates, result.dateRangeStart, result.dateRangeEnd)
        : result.candidatesInDateRange,
    skippedCandidatesReason,
    syncNotes: [
      ...(result.syncNotes ?? []),
      ...(territoryFiltered > 0
        ? [`${territoryFiltered} candidate(s) removed by DM territory filter (state on candidate record).`]
        : []),
    ],
  };
}

export function guardBreezyCandidatesResult(
  result: BreezyCandidatesResult,
  session: AuthSession | null,
): BreezyCandidatesResult {
  if (!session || !result.ok) return result;
  if (session.role === "executive" || session.role === "recruiter") return result;
  return guardBreezyCandidatesSuccess(result, session);
}

export function guardBreezyCandidatesDebugResult(
  result: BreezyCandidatesDebugResult,
  session: AuthSession | null,
): BreezyCandidatesDebugResult {
  if (!session || !result.ok) return result;
  if (session.role === "executive" || session.role === "recruiter") return result;
  const guarded = guardBreezyCandidatesSuccess(result, session);
  if (!result.dateRangeStart || !result.dateRangeEnd) return guarded;
  return {
    ...guarded,
    publishedCandidatesInRange: countCandidatesInRangeForPipelineStatus(
      guarded.candidates,
      result.dateRangeStart,
      result.dateRangeEnd,
      "published",
    ),
    closedCandidatesInRange: countCandidatesInRangeForPipelineStatus(
      guarded.candidates,
      result.dateRangeStart,
      result.dateRangeEnd,
      "closed",
    ),
    archivedCandidatesInRange: countCandidatesInRangeForPipelineStatus(
      guarded.candidates,
      result.dateRangeStart,
      result.dateRangeEnd,
      "archived",
    ),
  };
}
