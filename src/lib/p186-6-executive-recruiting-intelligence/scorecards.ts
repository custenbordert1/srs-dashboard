import { readMinScorecardSample } from "@/lib/p186-6-executive-recruiting-intelligence/flags";
import { calculateAging } from "@/lib/p186-6-executive-recruiting-intelligence/aging";
import type {
  P1866CohortCandidate,
  P1866Scorecard,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";
import { average } from "@/lib/p186-6-executive-recruiting-intelligence/util";

function ratio(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

function buildOwnerScorecard(
  ownerType: "recruiter" | "dm",
  owner: string,
  rows: P1866CohortCandidate[],
  nowMs: number,
  minSample: number,
): P1866Scorecard {
  const aging = calculateAging({ cohort: rows, nowMs });
  const stale = aging.filter((a) => a.band === "overdue" || a.band === "critical").length;
  const assigned = rows.length;
  const reviewsCompleted = rows.filter((r) =>
    ["HIRING_RECOMMENDATION", "OPERATOR_APPROVED", "PAPERWORK_NEEDED", "PAPERWORK_SENT", "PAPERWORK_VIEWED", "PAPERWORK_SIGNED", "ONBOARDING_COMPLETE", "READY_FOR_MEL", "MEL_EXPORT_REVIEW", "EXPORTED"].includes(r.funnelStage),
  ).length;
  const recommendations = rows.filter((r) =>
    ["HIRING_RECOMMENDATION", "OPERATOR_APPROVED", "PAPERWORK_NEEDED", "PAPERWORK_SENT", "PAPERWORK_SIGNED", "READY_FOR_MEL", "EXPORTED"].includes(r.funnelStage),
  ).length;
  const approved = rows.filter((r) =>
    ["OPERATOR_APPROVED", "PAPERWORK_NEEDED", "PAPERWORK_SENT", "PAPERWORK_SIGNED", "READY_FOR_MEL", "EXPORTED"].includes(r.funnelStage),
  ).length;
  const paperwork = rows.filter((r) =>
    ["PAPERWORK_SENT", "PAPERWORK_VIEWED", "PAPERWORK_SIGNED", "ONBOARDING_COMPLETE", "READY_FOR_MEL", "EXPORTED"].includes(r.funnelStage),
  ).length;
  const signed = rows.filter((r) =>
    ["PAPERWORK_SIGNED", "ONBOARDING_COMPLETE", "READY_FOR_MEL", "MEL_EXPORT_REVIEW", "EXPORTED"].includes(r.funnelStage),
  ).length;
  const onboarding = rows.filter((r) =>
    ["ONBOARDING_COMPLETE", "READY_FOR_MEL", "MEL_EXPORT_REVIEW", "EXPORTED"].includes(r.funnelStage),
  ).length;
  const ready = rows.filter((r) =>
    ["READY_FOR_MEL", "MEL_EXPORT_REVIEW", "EXPORTED"].includes(r.funnelStage),
  ).length;
  const exceptions = rows.filter((r) => r.blocked || r.workflowConflict || r.shadowMismatch).length;
  const insufficient = assigned < minSample;

  return {
    ownerType,
    owner,
    sampleSize: assigned,
    ranked: !insufficient,
    assignedCandidates: assigned,
    reviewsCompleted,
    recommendationsMade: recommendations,
    approvalConversion: ratio(approved, recommendations || assigned),
    paperworkConversion: ratio(paperwork, approved || assigned),
    signedConversion: ratio(signed, paperwork || assigned),
    onboardingCompletion: ratio(onboarding, signed || assigned),
    readyForMelConversion: ratio(ready, onboarding || assigned),
    averageResponseTimeMs: average(rows.map((r) => r.approvalDelayMs ?? 0).filter((n) => n > 0)),
    averageTimeToRecommendationMs: average(
      rows
        .filter((r) => r.funnelStage !== "APPLIED")
        .map((r) => Math.max(0, nowMs - Date.parse(r.stageEnteredAt))),
    ),
    averageAgingMs: average(aging.map((a) => a.ageMs)),
    staleCandidateCount: stale,
    exceptionRate: ratio(exceptions, assigned),
    insufficientSample: insufficient,
  };
}

export function buildRecruiterScorecards(input: {
  cohort: P1866CohortCandidate[];
  nowMs?: number;
  minSample?: number;
}): P1866Scorecard[] {
  const now = input.nowMs ?? Date.now();
  const min = input.minSample ?? readMinScorecardSample();
  const byOwner = new Map<string, P1866CohortCandidate[]>();
  for (const c of input.cohort) {
    const owner = c.recruiter?.trim();
    if (!owner) continue;
    const list = byOwner.get(owner) ?? [];
    list.push(c);
    byOwner.set(owner, list);
  }
  return [...byOwner.entries()]
    .map(([owner, rows]) => buildOwnerScorecard("recruiter", owner, rows, now, min))
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

export function buildDmScorecards(input: {
  cohort: P1866CohortCandidate[];
  nowMs?: number;
  minSample?: number;
}): P1866Scorecard[] {
  const now = input.nowMs ?? Date.now();
  const min = input.minSample ?? readMinScorecardSample();
  const byOwner = new Map<string, P1866CohortCandidate[]>();
  for (const c of input.cohort) {
    const owner = c.dm?.trim();
    if (!owner) continue;
    const list = byOwner.get(owner) ?? [];
    list.push(c);
    byOwner.set(owner, list);
  }
  return [...byOwner.entries()]
    .map(([owner, rows]) => buildOwnerScorecard("dm", owner, rows, now, min))
    .sort((a, b) => b.sampleSize - a.sampleSize);
}
