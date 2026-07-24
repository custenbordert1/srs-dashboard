import {
  isP223OperationallyActiveWorkflowStage,
  isP223TerminalWorkflowStage,
} from "@/lib/p223-recruiter-inbox-restoration";
import { evaluateP214Gates, p214TierForMiles } from "@/lib/p214-unsent-test-batch/eligibility";
import { hasUsableEmail, hasUsableIdentity, isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import type {
  P228CandidateSnapshot,
  P228CoverageTier,
  P228EligibilityBlocker,
  P228EligibilityRow,
  P228EligibilityTotals,
} from "@/lib/p228-production-readiness/types";

const EMPTY_TOTALS = (): P228EligibilityTotals => ({
  eligible: 0,
  evaluated: 0,
  workflowActiveEvaluated: 0,
  missing_identity: 0,
  missing_email: 0,
  missing_phone: 0,
  missing_position: 0,
  missing_location: 0,
  missing_assigned_dm: 0,
  missing_recruiter: 0,
  over_60_miles: 0,
  coverage_unknown: 0,
  archived: 0,
  duplicate: 0,
  already_sent: 0,
  already_signed: 0,
  other: 0,
});

export function isUnassignedRecruiter(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return !v || /^unassigned$/i.test(v);
}

export function hasUsablePhone(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

export function hasUsablePosition(positionId: string, positionName: string): boolean {
  return Boolean(String(positionId ?? "").trim() || String(positionName ?? "").trim());
}

export function hasUsableLocation(city: string, state: string): boolean {
  return Boolean(String(city ?? "").trim() && String(state ?? "").trim());
}

/**
 * Collect all send-readiness blockers for a workflow-active candidate.
 * Does not short-circuit — every applicable reason is reported.
 */
export function evaluateP228EligibilityBlockers(
  c: P228CandidateSnapshot,
): P228EligibilityBlocker[] {
  const blockers: P228EligibilityBlocker[] = [];

  if (isP223TerminalWorkflowStage(c.workflowStatus)) {
    blockers.push("archived");
  }

  if (!hasUsableIdentity(c.name)) blockers.push("missing_identity");
  if (!hasUsableEmail(c.email)) blockers.push("missing_email");
  if (!hasUsablePhone(c.phone)) blockers.push("missing_phone");
  if (!hasUsablePosition(c.positionId, c.positionName)) blockers.push("missing_position");
  if (!hasUsableLocation(c.city, c.state)) blockers.push("missing_location");
  if (isUnassignedDm(c.assignedDM)) blockers.push("missing_assigned_dm");
  if (isUnassignedRecruiter(c.assignedRecruiter)) blockers.push("missing_recruiter");
  if (c.isDuplicate) blockers.push("duplicate");

  const status = String(c.paperworkStatus ?? "");
  const stage = String(c.workflowStatus ?? "");
  if (status === "signed" || stage === "Signed") {
    blockers.push("already_signed");
  } else if (
    status === "sent" ||
    status === "viewed" ||
    stage === "Paperwork Sent" ||
    Boolean(String(c.signatureRequestId ?? "").trim())
  ) {
    blockers.push("already_sent");
  }

  const gates = evaluateP214Gates({
    nearestActiveWorkMiles: c.nearestActiveWorkMiles,
    hasActiveOpportunities: true,
    coverageKnown: c.coverageKnown,
    assignedDm: c.assignedDM,
    expectedDm: c.assignedDM, // DM correctness checked separately when expected known
    jobCity: c.city,
    jobState: c.state,
    marketIndependentlyVerified: hasUsableLocation(c.city, c.state),
  });

  for (const b of gates.blockers) {
    if (b === "blocked_over_60_miles") blockers.push("over_60_miles");
    else if (b === "blocked_coverage_unknown") blockers.push("coverage_unknown");
    else if (b === "blocked_dm_unassigned") {
      /* already covered */
    } else if (b === "manual_review_40_60_miles") {
      // Manual review is not auto-eligible; treat as other operational gate.
      if (!blockers.includes("other")) blockers.push("other");
    } else if (b === "blocked_no_active_work" || b === "blocked_non_geographic_posting") {
      if (!blockers.includes("other")) blockers.push("other");
    } else if (b === "blocked_dm_wrong") {
      if (!blockers.includes("other")) blockers.push("other");
    }
  }

  // Stage gate: only Paperwork Needed + not_sent can be fully eligible for send.
  if (stage !== "Paperwork Needed" && !blockers.includes("already_sent") && !blockers.includes("already_signed") && !blockers.includes("archived")) {
    if (!blockers.includes("other")) blockers.push("other");
  }

  return [...new Set(blockers)];
}

/** Strict send-eligible: Paperwork Needed, no blockers except we allow missing phone/recruiter as soft? No — all listed blockers apply. */
export function isP228SendEligible(c: P228CandidateSnapshot): boolean {
  if (String(c.workflowStatus) !== "Paperwork Needed") return false;
  if (String(c.paperworkStatus) !== "not_sent") return false;
  if (String(c.signatureRequestId ?? "").trim()) return false;
  const blockers = evaluateP228EligibilityBlockers(c);
  // Soft: missing_phone and missing_recruiter do not block controlled Dropbox sends historically
  // (P227 Christina/Sarah had Unassigned recruiter). Keep them in totals but allow eligibility.
  const hard = blockers.filter((b) => b !== "missing_phone" && b !== "missing_recruiter");
  return hard.length === 0;
}

export function eligibilityScore(c: P228CandidateSnapshot): number {
  const blockers = evaluateP228EligibilityBlockers(c);
  const hard = blockers.filter((b) => b !== "missing_phone");
  return Math.max(0, Math.round(100 - hard.length * 12));
}

export function resolveCoverageTier(
  miles: number | null,
  coverageKnown: boolean,
): P228CoverageTier {
  if (!coverageKnown || miles == null) return "unknown";
  return p214TierForMiles(miles) as P228CoverageTier;
}

export function assessEligibility(candidates: P228CandidateSnapshot[]): {
  totals: P228EligibilityTotals;
  rows: P228EligibilityRow[];
  topBlockers: Array<{ blocker: P228EligibilityBlocker | "eligible"; count: number }>;
} {
  const totals = EMPTY_TOTALS();
  const rows: P228EligibilityRow[] = [];

  for (const c of candidates) {
    if (!isP223OperationallyActiveWorkflowStage(c.workflowStatus)) continue;
    totals.workflowActiveEvaluated += 1;
    totals.evaluated += 1;

    const blockers = evaluateP228EligibilityBlockers(c);
    const eligible = isP228SendEligible(c);
    if (eligible) totals.eligible += 1;
    for (const b of blockers) totals[b] += 1;

    rows.push({
      redactedCandidateId: c.redactedCandidateId,
      state: c.state,
      workflowStatus: c.workflowStatus,
      paperworkStatus: c.paperworkStatus,
      assignedDM: c.assignedDM,
      assignedRecruiter: c.assignedRecruiter,
      nearestActiveWorkMiles: c.nearestActiveWorkMiles,
      coverageTier: c.coverageTier,
      eligible,
      blockers,
      listMembershipSource: c.listMembershipSource,
    });
  }

  const topBlockers: Array<{ blocker: P228EligibilityBlocker | "eligible"; count: number }> = [
    { blocker: "eligible", count: totals.eligible },
    ...(
      [
        "already_sent",
        "already_signed",
        "missing_identity",
        "missing_email",
        "missing_phone",
        "missing_position",
        "missing_location",
        "missing_assigned_dm",
        "missing_recruiter",
        "over_60_miles",
        "coverage_unknown",
        "archived",
        "duplicate",
        "other",
      ] as P228EligibilityBlocker[]
    )
      .map((blocker) => ({ blocker, count: totals[blocker] }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count),
  ];

  return { totals, rows, topBlockers };
}
