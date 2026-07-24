import { isP223OperationallyActiveWorkflowStage } from "@/lib/p223-recruiter-inbox-restoration";
import {
  eligibilityScore,
  isP228SendEligible,
  isUnassignedRecruiter,
} from "@/lib/p228-production-readiness/eligibility";
import type {
  P228CandidateSnapshot,
  P228CoverageTier,
  P228DmHealthRow,
  P228RecruiterHealthRow,
} from "@/lib/p228-production-readiness/types";

function emptyTierDist(): Record<P228CoverageTier, number> {
  return {
    tier1_0_20: 0,
    tier2_21_39: 0,
    review_40_60: 0,
    out_of_range: 0,
    unknown: 0,
  };
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export function assessRecruiterHealth(
  candidates: P228CandidateSnapshot[],
): P228RecruiterHealthRow[] {
  const byRec = new Map<
    string,
    {
      candidateCount: number;
      paperworkQueue: number;
      interviewQueue: number;
      overdueQueue: number;
      readyForMel: number;
      unassignedCandidates: number;
      distances: number[];
      scores: number[];
    }
  >();

  for (const c of candidates) {
    if (!isP223OperationallyActiveWorkflowStage(c.workflowStatus)) continue;
    const recruiter = String(c.assignedRecruiter || "Unassigned").trim() || "Unassigned";
    const row = byRec.get(recruiter) ?? {
      candidateCount: 0,
      paperworkQueue: 0,
      interviewQueue: 0,
      overdueQueue: 0,
      readyForMel: 0,
      unassignedCandidates: 0,
      distances: [],
      scores: [],
    };
    row.candidateCount += 1;
    if (c.workflowStatus === "Paperwork Needed" || c.workflowStatus === "Paperwork Sent") {
      row.paperworkQueue += 1;
    }
    if (c.workflowStatus === "Needs Review" || c.workflowStatus === "Qualified") {
      row.interviewQueue += 1;
    }
    if (c.workflowStatus === "Paperwork Sent" && c.paperworkStatus !== "signed") {
      row.overdueQueue += 1;
    }
    if (c.workflowStatus === "Ready for MEL") row.readyForMel += 1;
    if (isUnassignedRecruiter(c.assignedRecruiter)) row.unassignedCandidates += 1;
    if (c.nearestActiveWorkMiles != null) row.distances.push(c.nearestActiveWorkMiles);
    row.scores.push(eligibilityScore(c));
    byRec.set(recruiter, row);
  }

  return [...byRec.entries()]
    .map(([recruiter, r]) => ({
      recruiter,
      candidateCount: r.candidateCount,
      paperworkQueue: r.paperworkQueue,
      interviewQueue: r.interviewQueue,
      overdueQueue: r.overdueQueue,
      readyForMel: r.readyForMel,
      unassignedCandidates: r.unassignedCandidates,
      avgDistance: avg(r.distances),
      avgEligibilityScore:
        r.scores.length === 0
          ? 0
          : Math.round(r.scores.reduce((a, b) => a + b, 0) / r.scores.length),
    }))
    .sort((a, b) => b.candidateCount - a.candidateCount);
}

export function assessDmHealth(candidates: P228CandidateSnapshot[]): P228DmHealthRow[] {
  const byDm = new Map<
    string,
    {
      assigned: number;
      paperwork: number;
      eligible: number;
      blocked: number;
      distances: number[];
      tiers: Record<P228CoverageTier, number>;
    }
  >();

  for (const c of candidates) {
    if (!isP223OperationallyActiveWorkflowStage(c.workflowStatus)) continue;
    const dm = String(c.assignedDM || "Unassigned").trim() || "Unassigned";
    const row = byDm.get(dm) ?? {
      assigned: 0,
      paperwork: 0,
      eligible: 0,
      blocked: 0,
      distances: [],
      tiers: emptyTierDist(),
    };
    row.assigned += 1;
    if (c.workflowStatus === "Paperwork Needed" || c.workflowStatus === "Paperwork Sent") {
      row.paperwork += 1;
    }
    if (isP228SendEligible(c)) row.eligible += 1;
    else row.blocked += 1;
    if (c.nearestActiveWorkMiles != null) row.distances.push(c.nearestActiveWorkMiles);
    row.tiers[c.coverageTier] = (row.tiers[c.coverageTier] ?? 0) + 1;
    byDm.set(dm, row);
  }

  return [...byDm.entries()]
    .map(([districtManager, r]) => ({
      districtManager,
      assigned: r.assigned,
      paperwork: r.paperwork,
      eligible: r.eligible,
      blocked: r.blocked,
      avgDistance: avg(r.distances),
      tierDistribution: r.tiers,
    }))
    .sort((a, b) => b.assigned - a.assigned);
}
