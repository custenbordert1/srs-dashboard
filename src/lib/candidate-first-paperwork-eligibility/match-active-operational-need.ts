import type { BreezyJob } from "@/lib/breezy-api";
import { distanceBetweenLocations } from "@/lib/mel-matching/distance-utils";

export type OperationalNeedMatch = {
  jobId: string;
  jobName: string;
  city: string;
  state: string;
  distanceMiles: number | null;
  matchScore: number;
  matchReason: string;
};

export type OriginalJobStatus = "published" | "closed_or_unpublished" | "unknown";

export function resolveOriginalJobStatus(
  positionId: string | null | undefined,
  jobsByPositionId: Map<string, BreezyJob>,
): OriginalJobStatus {
  if (!positionId?.trim()) return "unknown";
  const job = jobsByPositionId.get(positionId);
  if (job && job.status === "published") return "published";
  return "closed_or_unpublished";
}

function normalizeLocation(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findNearestActiveOperationalNeed(input: {
  candidateCity: string;
  candidateState: string;
  publishedJobs: BreezyJob[];
  maxDistanceMiles?: number;
}): OperationalNeedMatch | null {
  const candidateCity = input.candidateCity.trim();
  const candidateState = input.candidateState.trim();
  if (!candidateState || input.publishedJobs.length === 0) return null;

  const maxDistance = input.maxDistanceMiles ?? 90;
  let best: OperationalNeedMatch | null = null;

  for (const job of input.publishedJobs) {
    if (job.status !== "published") continue;
    const distanceMiles = distanceBetweenLocations(
      candidateCity,
      candidateState,
      job.city,
      job.state,
    );
    if (distanceMiles != null && distanceMiles > maxDistance) continue;

    let matchScore = 30;
    const reasons: string[] = ["Active published Breezy position"];

    if (normalizeLocation(job.state) === normalizeLocation(candidateState)) {
      matchScore += 35;
      reasons.push(`same state (${job.state})`);
    }
    if (
      candidateCity &&
      job.city &&
      normalizeLocation(job.city) === normalizeLocation(candidateCity)
    ) {
      matchScore += 25;
      reasons.push(`same city (${job.city})`);
    }
    if (distanceMiles != null) {
      if (distanceMiles <= 25) {
        matchScore += 20;
        reasons.push(`${Math.round(distanceMiles)}mi`);
      } else if (distanceMiles <= 60) {
        matchScore += 10;
        reasons.push(`${Math.round(distanceMiles)}mi`);
      }
    }

    const match: OperationalNeedMatch = {
      jobId: job.jobId,
      jobName: job.name,
      city: job.city,
      state: job.state,
      distanceMiles,
      matchScore,
      matchReason: reasons.join(", "),
    };

    if (!best || match.matchScore > best.matchScore) {
      best = match;
    }
  }

  return best;
}

export function hasOperationalFit(match: OperationalNeedMatch | null, minScore = 55): boolean {
  return match != null && match.matchScore >= minScore;
}
