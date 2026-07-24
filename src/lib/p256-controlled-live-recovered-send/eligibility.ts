import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  assertDuplicateProtectionIntact,
  evaluateP253Eligibility,
  recheckP253CandidateLive,
  type P253EligibilityEval,
} from "@/lib/p253-controlled-live-paperwork-send/eligibility";
import type { P235OppPoint } from "@/lib/p235-controlled-newest-five-send/eligibility";
import type {
  P256AuthorizedTarget,
  P256CandidateRow,
  P256Counts,
  P256ResultCode,
} from "@/lib/p256-controlled-live-recovered-send/types";
import type { P253ResultCode } from "@/lib/p253-controlled-live-paperwork-send/types";

function emptyCounts(): P256Counts {
  return {
    evaluated: 0,
    eligible: 0,
    sent: 0,
    skipped: 0,
    failures: 0,
    alreadySent: 0,
    alreadySigned: 0,
    gateFailed: 0,
  };
}

function mapResult(code: P253ResultCode | P256ResultCode): P256ResultCode {
  return code as P256ResultCode;
}

export type P256EligibilityEval = {
  counts: P256Counts;
  rows: P256CandidateRow[];
  eligibleIds: string[];
  priorSentIds: Set<string>;
  emailOwners: Map<string, string>;
  p253: P253EligibilityEval;
};

/**
 * Recalculate P253 eligibility gates for ONLY the authorized recovered cohort.
 * Any gate failure aborts that candidate (row marked ineligible).
 */
export async function evaluateP256Eligibility(input: {
  targets: P256AuthorizedTarget[];
  workflows: Record<string, CandidateWorkflowRecord>;
  candidatesById: Map<string, BreezyCandidate>;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  opportunityPoints: P235OppPoint[];
  refreshedIds: Set<string>;
  allowNetworkGeocode?: boolean;
  cwd?: string;
}): Promise<P256EligibilityEval> {
  const authorizedIds = new Set(input.targets.map((t) => t.candidateId));
  const targetById = new Map(input.targets.map((t) => [t.candidateId, t]));

  // Scope P253 evaluator to authorized workflows only — never evaluates bulk cohort.
  const scopedWorkflows: Record<string, CandidateWorkflowRecord> = {};
  for (const id of authorizedIds) {
    if (input.workflows[id]) scopedWorkflows[id] = input.workflows[id];
  }

  const p253 = await evaluateP253Eligibility({
    workflows: scopedWorkflows,
    candidatesById: input.candidatesById,
    onboardingByCandidateId: input.onboardingByCandidateId,
    opportunityPoints: input.opportunityPoints,
    allowNetworkGeocode: input.allowNetworkGeocode === true,
    cwd: input.cwd,
  });

  const counts = emptyCounts();
  const rows: P256CandidateRow[] = [];
  const eligibleIds: string[] = [];
  const seen = new Set<string>();

  for (const target of input.targets) {
    seen.add(target.candidateId);
    const p253Row = p253.rows.find((r) => r.candidateId === target.candidateId);
    const wf = input.workflows[target.candidateId];
    const candidate = input.candidatesById.get(target.candidateId);
    const email =
      String(candidate?.email ?? target.email ?? "").trim() || target.email;

    if (!wf) {
      counts.evaluated += 1;
      counts.gateFailed += 1;
      counts.skipped += 1;
      rows.push({
        candidateId: target.candidateId,
        name: target.name,
        email,
        location: "",
        recruiter: "Unassigned",
        districtManager: "Unassigned",
        workflowStatus: "",
        paperworkStatus: "not_sent",
        nearestMiles: null,
        coverageKnown: false,
        eligible: false,
        blockers: ["missing_workflow"],
        result: "gate_failed_after_refresh",
        signatureRequestId: null,
        sentAt: null,
        error: "missing_workflow after refresh",
        refreshedFromBreezy: input.refreshedIds.has(target.candidateId),
        positionId: target.positionId,
      });
      continue;
    }

    if (!p253Row) {
      counts.evaluated += 1;
      counts.gateFailed += 1;
      counts.skipped += 1;
      rows.push({
        candidateId: target.candidateId,
        name: target.name,
        email,
        location: "",
        recruiter: String(wf.assignedRecruiter ?? "Unassigned"),
        districtManager: String(wf.assignedDM ?? "Unassigned"),
        workflowStatus: String(wf.workflowStatus ?? ""),
        paperworkStatus: String(wf.paperworkStatus ?? "not_sent"),
        nearestMiles: null,
        coverageKnown: false,
        eligible: false,
        blockers: ["not_evaluated"],
        result: "gate_failed_after_refresh",
        signatureRequestId: String(wf.signatureRequestId ?? "").trim() || null,
        sentAt: null,
        error: "P253 evaluator did not return a row",
        refreshedFromBreezy: input.refreshedIds.has(target.candidateId),
        positionId: target.positionId,
      });
      continue;
    }

    counts.evaluated += 1;
    const eligible = p253Row.eligible && p253Row.blockers.length === 0;
    const result: P256ResultCode = eligible
      ? "eligible_pending_send"
      : p253Row.blockers.length
        ? mapResult(
            p253Row.result === "eligible_pending_send"
              ? "gate_failed_after_refresh"
              : p253Row.result,
          )
        : "gate_failed_after_refresh";

    if (eligible) {
      counts.eligible += 1;
      eligibleIds.push(target.candidateId);
    } else {
      counts.gateFailed += 1;
      counts.skipped += 1;
      if (result === "already_sent") counts.alreadySent += 1;
      if (result === "already_signed") counts.alreadySigned += 1;
    }

    rows.push({
      candidateId: target.candidateId,
      name: p253Row.name || target.name,
      email,
      location: p253Row.location,
      recruiter: p253Row.recruiter,
      districtManager: p253Row.districtManager,
      workflowStatus: p253Row.workflowStatus,
      paperworkStatus: p253Row.paperworkStatus,
      nearestMiles: p253Row.nearestMiles,
      coverageKnown: p253Row.coverageKnown,
      eligible,
      blockers: eligible
        ? []
        : p253Row.blockers.length
          ? p253Row.blockers
          : ["gate_failed_after_refresh"],
      result: eligible ? "eligible_pending_send" : result,
      signatureRequestId: p253Row.signatureRequestId,
      sentAt: null,
      error: eligible ? null : (p253Row.blockers.join(", ") || "gate failed"),
      refreshedFromBreezy: input.refreshedIds.has(target.candidateId),
      positionId:
        target.positionId ||
        String(candidate?.positionId ?? "").trim() ||
        null,
    });
  }

  // Safety: never include non-authorized rows from p253 spillover.
  for (const row of p253.rows) {
    if (!authorizedIds.has(row.candidateId) || seen.has(row.candidateId)) continue;
    // Should never happen with scoped workflows — still hard-skip.
  }

  void targetById;

  return {
    counts,
    rows,
    eligibleIds,
    priorSentIds: p253.priorSentIds,
    emailOwners: p253.emailOwners,
    p253: {
      ...p253,
      eligibleIds,
      rows: p253.rows.filter((r) => authorizedIds.has(r.candidateId)),
    },
  };
}

export { assertDuplicateProtectionIntact, recheckP253CandidateLive };
