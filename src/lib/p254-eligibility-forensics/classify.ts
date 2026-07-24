import type { P253CandidateRow } from "@/lib/p253-controlled-live-paperwork-send/types";
import {
  P254_FAILURE_GROUPS,
  P254_RECOVERABLE_ISSUES,
  type P254CandidateForensic,
  type P254FailureGroup,
  type P254FailureGroupBucket,
  type P254RecoverableImpact,
  type P254RecoverableIssue,
  type P254Totals,
} from "@/lib/p254-eligibility-forensics/types";

const RECOVERABLE = new Set<string>(P254_RECOVERABLE_ISSUES);

const HARD_BLOCKERS = new Set([
  "already_signed",
  "already_sent",
  "active_packet",
  "prior_sent_exclusion",
  "duplicate",
  "not_paperwork_needed",
  "qualification_failed",
  "exclusion_list",
  "distance_blocked",
  "manual_review_40_60",
]);

/**
 * Forensic primary gate — finer than P253 primaryResult so Packet pending
 * is split from Already sent when an active Dropbox packet exists.
 */
export function classifyP254FailureGroup(blockers: string[]): {
  group: P254FailureGroup;
  exactGate: string;
} {
  const set = new Set(blockers);

  if (set.has("already_signed")) {
    return { group: "Already signed", exactGate: "already_signed" };
  }
  if (set.has("active_packet")) {
    return { group: "Packet pending", exactGate: "active_packet" };
  }
  if (set.has("already_sent") || set.has("prior_sent_exclusion")) {
    return {
      group: "Already sent",
      exactGate: set.has("already_sent") ? "already_sent" : "prior_sent_exclusion",
    };
  }
  if (set.has("duplicate")) {
    return { group: "Duplicate", exactGate: "duplicate" };
  }
  if (set.has("distance_blocked") || set.has("manual_review_40_60")) {
    return {
      group: "Distance exceeded",
      exactGate: set.has("distance_blocked")
        ? "distance_blocked"
        : "manual_review_40_60",
    };
  }
  if (set.has("coverage_blocked")) {
    return { group: "Coverage unknown", exactGate: "coverage_blocked" };
  }
  if (set.has("missing_recruiter")) {
    return { group: "Missing recruiter", exactGate: "missing_recruiter" };
  }
  if (set.has("missing_dm")) {
    return { group: "Missing DM", exactGate: "missing_dm" };
  }
  if (set.has("missing_phone")) {
    return { group: "Missing phone", exactGate: "missing_phone" };
  }
  if (set.has("missing_email")) {
    return { group: "Missing email", exactGate: "missing_email" };
  }
  if (set.has("missing_identity")) {
    return { group: "Missing identity", exactGate: "missing_identity" };
  }
  if (set.has("qualification_failed")) {
    return { group: "Qualification failure", exactGate: "qualification_failed" };
  }
  if (blockers.length === 0) {
    return { group: "Other", exactGate: "none" };
  }
  return { group: "Other", exactGate: blockers[0] ?? "other_blocked" };
}

export function dropboxSignStatusFromRow(row: P253CandidateRow): string {
  if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
    return "signed";
  }
  if (row.paperworkStatus === "viewed") return "viewed";
  if (row.paperworkStatus === "sent") return "sent";
  if (row.paperworkStatus === "declined") return "declined";
  if (row.paperworkStatus === "failed") return "failed";
  if (row.signatureRequestId || row.blockers.includes("active_packet")) {
    return "pending_packet";
  }
  if (row.paperworkStatus === "not_sent") return "not_sent";
  return row.paperworkStatus || "unknown";
}

const RECOVERABLE_ACTION: Record<string, string> = {
  missing_recruiter: "assign recruiter",
  missing_dm: "assign DM",
  coverage_blocked: "recover home location/geocode + opportunity coverage",
  missing_phone: "backfill usable phone",
  missing_email: "backfill usable email",
  missing_identity: "backfill candidate identity/name",
};

export function requiredActionForForensic(input: {
  group: P254FailureGroup;
  exactGate: string;
  blockers: string[];
  automaticallyRecoverable: boolean;
}): string {
  const { group, exactGate, blockers, automaticallyRecoverable } = input;

  if (automaticallyRecoverable) {
    const steps = blockers
      .filter((b) => RECOVERABLE.has(b))
      .map((b) => RECOVERABLE_ACTION[b] ?? b);
    return `Auto-recoverable: ${steps.join("; ")}; then re-evaluate eligibility.`;
  }

  switch (group) {
    case "Already signed":
      return "No new send — packet already signed; advance workflow / MEL when ready.";
    case "Packet pending":
      return "No new send — active Dropbox Sign packet exists; await signature or send reminder only.";
    case "Already sent":
      return "No new send — paperwork already sent / prior-sent exclusion; do not create duplicate.";
    case "Duplicate":
      return "Resolve duplicate identity / email ownership before any send.";
    case "Distance exceeded":
      return "Manual proximity review — candidate exceeds distance policy; do not auto-send.";
    case "Coverage unknown":
      return "Manual coverage review — fix home location or opportunity geocode, then re-run.";
    case "Missing recruiter":
      return "Assign recruiter (auto-roster / territory) then re-evaluate.";
    case "Missing DM":
      return "Assign district manager (auto-roster / territory) then re-evaluate.";
    case "Missing phone":
      return "Backfill usable phone from Breezy / candidate record, then re-evaluate.";
    case "Missing email":
      return "Backfill usable email from Breezy / candidate record, then re-evaluate.";
    case "Missing identity":
      return "Backfill candidate name / identity from Breezy, then re-evaluate.";
    case "Qualification failure":
      return "Manual qualification review — not auto-eligible for paperwork send.";
    default: {
      if (blockers.includes("not_paperwork_needed")) {
        return "Stage is not Paperwork Needed — advance workflow only when business-ready.";
      }
      if (blockers.includes("exclusion_list")) {
        return "Exclusion list — do not send.";
      }
      return `Manual review for gate: ${exactGate}.`;
    }
  }
}

export function isAutomaticallyRecoverable(blockers: string[]): boolean {
  if (blockers.length === 0) return false;
  if (blockers.some((b) => HARD_BLOCKERS.has(b))) return false;
  return blockers.every((b) => RECOVERABLE.has(b));
}

/**
 * Would this candidate become eligible if the listed blockers were removed?
 * Still requires Paperwork Needed and no remaining blockers.
 */
export function wouldBecomeEligibleIfBlockersRemoved(
  row: P253CandidateRow,
  remove: ReadonlySet<string>,
): boolean {
  if (row.workflowStatus !== "Paperwork Needed") return false;
  const remaining = row.blockers.filter((b) => !remove.has(b));
  // P253 also requires eligible === blockers empty + Paperwork Needed
  return remaining.length === 0;
}

export function buildP254CandidateForensic(input: {
  row: P253CandidateRow;
  breezyStage: string | null;
}): P254CandidateForensic {
  const { row, breezyStage } = input;
  const { group, exactGate } = classifyP254FailureGroup(row.blockers);
  const automaticallyRecoverable = isAutomaticallyRecoverable(row.blockers);

  return {
    candidateId: row.candidateId,
    name: row.name,
    workflowStage: row.workflowStatus,
    breezyStage,
    dropboxSignStatus: dropboxSignStatusFromRow(row),
    recruiter: row.recruiter,
    districtManager: row.districtManager,
    distanceMiles: row.nearestMiles,
    coverageKnown: row.coverageKnown,
    eligibilityResult: row.result,
    exactGateFailed: exactGate,
    failureGroup: group,
    allBlockers: [...row.blockers],
    automaticallyRecoverable,
    requiredAction: requiredActionForForensic({
      group,
      exactGate,
      blockers: row.blockers,
      automaticallyRecoverable,
    }),
    signatureRequestId: row.signatureRequestId,
    location: row.location,
  };
}

export function buildP254FailureGroups(
  candidates: P254CandidateForensic[],
): P254FailureGroupBucket[] {
  const map = new Map<P254FailureGroup, P254FailureGroupBucket>();
  for (const g of P254_FAILURE_GROUPS) {
    map.set(g, {
      group: g,
      count: 0,
      automaticallyRecoverable: 0,
      requiringManualAction: 0,
      candidateIds: [],
    });
  }
  for (const c of candidates) {
    const bucket = map.get(c.failureGroup)!;
    bucket.count += 1;
    bucket.candidateIds.push(c.candidateId);
    if (c.automaticallyRecoverable) bucket.automaticallyRecoverable += 1;
    else bucket.requiringManualAction += 1;
  }
  return P254_FAILURE_GROUPS.map((g) => map.get(g)!).filter((b) => b.count > 0 || true);
}

const ISSUE_LABELS: Record<P254RecoverableIssue, string> = {
  missing_recruiter: "Missing recruiter",
  missing_dm: "Missing DM",
  coverage_blocked: "Coverage unknown",
  missing_phone: "Missing phone",
  missing_email: "Missing email",
  missing_identity: "Missing identity",
};

/**
 * Per recoverable issue: exact count that would become eligible if that
 * single issue were fixed (other blockers left in place).
 */
export function buildP254RecoverableImpact(
  rows: P253CandidateRow[],
): P254RecoverableImpact[] {
  return P254_RECOVERABLE_ISSUES.map((issue) => {
    const withIssue = rows.filter((r) => r.blockers.includes(issue));
    const would = withIssue.filter((r) =>
      wouldBecomeEligibleIfBlockersRemoved(r, new Set([issue])),
    );
    return {
      issue,
      label: ISSUE_LABELS[issue],
      candidatesWithIssue: withIssue.length,
      wouldBecomeEligibleIfFixed: would.length,
      candidateIdsThatWouldBecomeEligible: would.map((r) => r.candidateId),
    };
  });
}

/** Combo impacts for common multi-gate recoverable clusters. */
export function buildP254ComboRecoverableImpact(
  rows: P253CandidateRow[],
): Array<{
  issues: P254RecoverableIssue[];
  label: string;
  wouldBecomeEligibleIfFixed: number;
  candidateIdsThatWouldBecomeEligible: string[];
}> {
  const combos: Array<{ issues: P254RecoverableIssue[]; label: string }> = [
    {
      issues: ["missing_phone", "coverage_blocked"],
      label: "Missing phone + Coverage unknown",
    },
    {
      issues: ["missing_recruiter", "missing_dm"],
      label: "Missing recruiter + Missing DM",
    },
    {
      issues: [
        "missing_recruiter",
        "missing_dm",
        "missing_phone",
        "coverage_blocked",
        "missing_email",
        "missing_identity",
      ],
      label: "All recoverable issues together",
    },
  ];

  return combos.map(({ issues, label }) => {
    const remove = new Set<string>(issues);
    const would = rows.filter((r) => wouldBecomeEligibleIfBlockersRemoved(r, remove));
    return {
      issues,
      label,
      wouldBecomeEligibleIfFixed: would.length,
      candidateIdsThatWouldBecomeEligible: would.map((r) => r.candidateId),
    };
  });
}

export function buildP254Totals(candidates: P254CandidateForensic[]): P254Totals {
  const blocked = candidates.filter((c) => c.eligibilityResult !== "eligible_pending_send");
  const recoverable = blocked.filter((c) => c.automaticallyRecoverable);
  return {
    reviewed: candidates.length,
    blocked: blocked.length,
    eligible: candidates.length - blocked.length,
    automaticallyRecoverable: recoverable.length,
    requiringManualAction: blocked.length - recoverable.length,
  };
}
