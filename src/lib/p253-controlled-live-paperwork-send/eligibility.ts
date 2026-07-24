import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { isP223OperationallyActiveWorkflowStage } from "@/lib/p223-recruiter-inbox-restoration";
import { hasUsableEmail, isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import {
  hasUsablePhone,
  isUnassignedRecruiter,
} from "@/lib/p228-production-readiness/eligibility";
import { P243_OSBPQ_KNOWN_SENT_IDS } from "@/lib/p243-open-store-bulk-paperwork-queue/types";
import {
  evaluateP235Proximity,
  type P235OppPoint,
} from "@/lib/p235-controlled-newest-five-send/eligibility";
import {
  loadP240PriorSentExclusion,
  p240DisplayName,
  p240IsCalvinBrown,
  p240NormalizeEmail,
} from "@/lib/p240-autonomous-new-applicant-pipeline/cohort";
import { resolveP253HomePoint } from "@/lib/p253-controlled-live-paperwork-send/refresh";
import type {
  P253CandidateRow,
  P253Counts,
  P253ResultCode,
} from "@/lib/p253-controlled-live-paperwork-send/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyCounts(): P253Counts {
  return {
    applicantsEvaluated: 0,
    eligible: 0,
    sentSuccessfully: 0,
    failed: 0,
    skipped: 0,
    alreadySent: 0,
    alreadySigned: 0,
    duplicatePrevented: 0,
    distanceBlocked: 0,
    missingRecruiter: 0,
    missingDm: 0,
    coverageBlocked: 0,
    qualificationFailed: 0,
    exclusionList: 0,
    missingIdentity: 0,
    missingEmail: 0,
    missingPhone: 0,
    notPaperworkNeeded: 0,
    otherBlocked: 0,
  };
}

function locationLabel(city: string, state: string): string {
  const c = city.trim();
  const s = state.trim();
  if (c && s) return `${c}, ${s}`;
  return c || s || "";
}

function primaryResultFromBlockers(blockers: string[]): P253ResultCode {
  if (blockers.includes("already_signed")) return "already_signed";
  if (blockers.includes("already_sent") || blockers.includes("active_packet")) {
    return "already_sent";
  }
  if (blockers.includes("duplicate") || blockers.includes("prior_sent_exclusion")) {
    return "duplicate_prevented";
  }
  if (blockers.includes("distance_blocked") || blockers.includes("manual_review_40_60")) {
    return "distance_blocked";
  }
  if (blockers.includes("coverage_blocked")) return "coverage_blocked";
  if (blockers.includes("missing_recruiter")) return "missing_recruiter";
  if (blockers.includes("missing_dm")) return "missing_dm";
  if (blockers.includes("missing_identity")) return "missing_identity";
  if (blockers.includes("missing_email")) return "missing_email";
  if (blockers.includes("missing_phone")) return "missing_phone";
  if (blockers.includes("qualification_failed")) return "qualification_failed";
  if (blockers.includes("exclusion_list")) return "exclusion_list";
  if (blockers.includes("not_paperwork_needed")) return "not_paperwork_needed";
  return "other_blocked";
}

function bumpCount(counts: P253Counts, result: P253ResultCode): void {
  switch (result) {
    case "eligible_pending_send":
    case "sent":
      counts.eligible += 1;
      break;
    case "already_sent":
      counts.alreadySent += 1;
      break;
    case "already_signed":
      counts.alreadySigned += 1;
      break;
    case "duplicate_prevented":
      counts.duplicatePrevented += 1;
      break;
    case "distance_blocked":
      counts.distanceBlocked += 1;
      break;
    case "missing_recruiter":
      counts.missingRecruiter += 1;
      break;
    case "missing_dm":
      counts.missingDm += 1;
      break;
    case "coverage_blocked":
      counts.coverageBlocked += 1;
      break;
    case "qualification_failed":
      counts.qualificationFailed += 1;
      break;
    case "exclusion_list":
      counts.exclusionList += 1;
      break;
    case "missing_identity":
      counts.missingIdentity += 1;
      break;
    case "missing_email":
      counts.missingEmail += 1;
      break;
    case "missing_phone":
      counts.missingPhone += 1;
      break;
    case "not_paperwork_needed":
      counts.notPaperworkNeeded += 1;
      break;
    default:
      counts.otherBlocked += 1;
      break;
  }
}

export type P253EligibilityEval = {
  counts: P253Counts;
  rows: P253CandidateRow[];
  eligibleIds: string[];
  priorSentIds: Set<string>;
  emailOwners: Map<string, string>;
};

/**
 * Strict P253 eligibility — ALL gates hard. Does not soften phone/recruiter
 * (unlike historical P228 soft eligibility).
 */
export async function evaluateP253Eligibility(input: {
  workflows: Record<string, CandidateWorkflowRecord>;
  candidatesById: Map<string, BreezyCandidate>;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  opportunityPoints: P235OppPoint[];
  allowNetworkGeocode?: boolean;
  cwd?: string;
}): Promise<P253EligibilityEval> {
  const counts = emptyCounts();
  const rows: P253CandidateRow[] = [];
  const eligibleIds: string[] = [];
  const prior = loadP240PriorSentExclusion(input.cwd);
  const priorSentIds = new Set<string>([
    ...prior.all,
    ...P243_OSBPQ_KNOWN_SENT_IDS,
  ]);

  const emailOwners = new Map<string, string>();
  for (const [id, candidate] of input.candidatesById) {
    const email = p240NormalizeEmail(candidate.email);
    if (!email || !EMAIL_RE.test(email)) continue;
    if (!emailOwners.has(email)) emailOwners.set(email, id);
  }

  const activeIds = Object.keys(input.workflows).filter((id) =>
    isP223OperationallyActiveWorkflowStage(input.workflows[id]?.workflowStatus ?? ""),
  );

  for (const candidateId of activeIds) {
    const wf = input.workflows[candidateId];
    const candidate = input.candidatesById.get(candidateId);
    const onboarding = input.onboardingByCandidateId.get(candidateId) ?? null;
    const name = p240DisplayName({
      firstName: candidate?.firstName,
      lastName: candidate?.lastName,
      email: candidate?.email ?? wf?.onboardingContactEmail,
      candidateId,
    });
    const city = String(candidate?.city ?? "").trim();
    const state = String(candidate?.state ?? "").trim();
    const zip = String(candidate?.zipCode ?? "").trim();
    const email = String(candidate?.email ?? wf?.onboardingContactEmail ?? "").trim();
    const phone = String(candidate?.phone ?? "").trim();
    const recruiter = String(wf?.assignedRecruiter ?? "Unassigned");
    const dm = String(wf?.assignedDM ?? "Unassigned");
    const workflowStatus = String(wf?.workflowStatus ?? "");
    const paperworkStatus = String(wf?.paperworkStatus ?? "not_sent");
    const signatureRequestId = String(wf?.signatureRequestId ?? "").trim() || null;

    const blockers: string[] = [];

    if (p240IsCalvinBrown(name)) blockers.push("exclusion_list");
    if (priorSentIds.has(candidateId)) blockers.push("prior_sent_exclusion");

    if (!name || /^unknown$/i.test(name)) blockers.push("missing_identity");
    if (!hasUsableEmail(email) || !EMAIL_RE.test(email)) blockers.push("missing_email");
    if (!hasUsablePhone(phone)) blockers.push("missing_phone");
    if (isUnassignedRecruiter(recruiter)) blockers.push("missing_recruiter");
    if (isUnassignedDm(dm)) blockers.push("missing_dm");

    if (workflowStatus === "Signed" || paperworkStatus === "signed") {
      blockers.push("already_signed");
    } else if (
      paperworkStatus === "sent" ||
      paperworkStatus === "viewed" ||
      workflowStatus === "Paperwork Sent" ||
      Boolean(signatureRequestId) ||
      Boolean(wf?.paperworkSentAt) ||
      Boolean(onboarding?.signatureRequestId)
    ) {
      blockers.push("already_sent");
      if (signatureRequestId || onboarding?.signatureRequestId) {
        blockers.push("active_packet");
      }
    }

    const dupReason = duplicatePaperworkSendBlockReason({
      workflow: wf,
      activeOnboarding: onboarding,
    });
    if (dupReason) blockers.push("duplicate");

    const normalizedEmail = p240NormalizeEmail(email);
    if (normalizedEmail && EMAIL_RE.test(normalizedEmail)) {
      const owner = emailOwners.get(normalizedEmail);
      if (owner && owner !== candidateId) blockers.push("duplicate");
    }

    if (
      workflowStatus === "Not Qualified" ||
      /\bnot qualified\b|\bdisqualified\b|\brejected\b/i.test(
        [...(wf?.notes ?? []), workflowStatus].join(" "),
      )
    ) {
      blockers.push("qualification_failed");
    }

    if (workflowStatus !== "Paperwork Needed") {
      blockers.push("not_paperwork_needed");
    }

    // Distance / coverage — only required for Paperwork Needed send candidates.
    let nearestMiles: number | null = null;
    let coverageKnown = false;
    if (workflowStatus === "Paperwork Needed") {
      const home = await resolveP253HomePoint({
        city,
        state,
        zip,
        allowNetwork: input.allowNetworkGeocode === true,
      });
      const proximity = evaluateP235Proximity({
        home,
        assignedDm: dm,
        expectedDm: dm,
        jobCity: city,
        jobState: state,
        opportunities: input.opportunityPoints,
      });
      nearestMiles = proximity.nearestMiles;
      coverageKnown = proximity.coverageKnown;

      if (proximity.blockers.includes("blocked_over_60_miles")) {
        blockers.push("distance_blocked");
      }
      if (proximity.blockers.includes("manual_review_40_60_miles")) {
        blockers.push("manual_review_40_60");
        blockers.push("distance_blocked");
      }
      if (
        proximity.blockers.includes("blocked_coverage_unknown") ||
        !proximity.coverageKnown ||
        proximity.nearestMiles == null
      ) {
        blockers.push("coverage_blocked");
      }
      if (proximity.blockers.includes("blocked_no_active_work")) {
        blockers.push("coverage_blocked");
      }
    }

    const uniqueBlockers = [...new Set(blockers)];
    const eligible = uniqueBlockers.length === 0 && workflowStatus === "Paperwork Needed";
    const result: P253ResultCode = eligible
      ? "eligible_pending_send"
      : primaryResultFromBlockers(uniqueBlockers);

    counts.applicantsEvaluated += 1;
    bumpCount(counts, result);
    if (eligible) eligibleIds.push(candidateId);

    rows.push({
      candidateId,
      name,
      location: locationLabel(city, state),
      recruiter,
      districtManager: dm,
      workflowStatus,
      paperworkStatus,
      nearestMiles,
      coverageKnown,
      eligible,
      blockers: uniqueBlockers,
      result,
      signatureRequestId,
      sentAt: null,
      error: null,
    });
  }

  rows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { counts, rows, eligibleIds, priorSentIds, emailOwners };
}

/**
 * Immediate pre-send recheck — returns blockers if state changed.
 */
export function recheckP253CandidateLive(input: {
  workflow: CandidateWorkflowRecord | null | undefined;
  onboarding: CandidateOnboardingRecord | null;
  priorSentIds: Set<string>;
  candidateId: string;
}): { ok: boolean; blockers: string[]; skipCode: P253ResultCode | null } {
  const wf = input.workflow;
  const blockers: string[] = [];
  if (!wf) {
    return { ok: false, blockers: ["missing_workflow"], skipCode: "skipped_state_change" };
  }
  if (input.priorSentIds.has(input.candidateId)) {
    return { ok: false, blockers: ["prior_sent_exclusion"], skipCode: "duplicate_prevented" };
  }
  if (wf.workflowStatus !== "Paperwork Needed") {
    blockers.push("not_paperwork_needed");
  }
  if (
    wf.paperworkStatus === "signed" ||
    wf.workflowStatus === "Signed" ||
    wf.paperworkSignedAt
  ) {
    return { ok: false, blockers: ["already_signed"], skipCode: "already_signed" };
  }
  if (
    wf.signatureRequestId ||
    input.onboarding?.signatureRequestId ||
    wf.paperworkStatus === "sent" ||
    wf.paperworkStatus === "viewed" ||
    wf.workflowStatus === "Paperwork Sent" ||
    wf.paperworkSentAt
  ) {
    return { ok: false, blockers: ["active_packet"], skipCode: "skipped_new_packet" };
  }
  if (isUnassignedRecruiter(wf.assignedRecruiter)) blockers.push("missing_recruiter");
  if (isUnassignedDm(wf.assignedDM)) blockers.push("missing_dm");
  if (blockers.length) {
    return {
      ok: false,
      blockers,
      skipCode: primaryResultFromBlockers(blockers),
    };
  }
  return { ok: true, blockers: [], skipCode: null };
}

export function assertDuplicateProtectionIntact(input: {
  rows: P253CandidateRow[];
  emailOwners: Map<string, string>;
}): { ok: boolean; detail: string } {
  // System-wide integrity: every already_sent/signed row must not also be marked eligible.
  const eligibleWithPacket = input.rows.filter(
    (r) =>
      r.eligible &&
      (Boolean(r.signatureRequestId) ||
        r.paperworkStatus === "sent" ||
        r.paperworkStatus === "viewed" ||
        r.paperworkStatus === "signed" ||
        r.workflowStatus === "Paperwork Sent" ||
        r.workflowStatus === "Signed"),
  );
  if (eligibleWithPacket.length > 0) {
    return {
      ok: false,
      detail: `Duplicate protection failed: ${eligibleWithPacket.length} eligible row(s) still carry packet/sent state.`,
    };
  }
  if (input.emailOwners.size === 0 && input.rows.some((r) => r.eligible)) {
    // Soft warning only when no emails at all — not a hard fail.
  }
  return { ok: true, detail: "Duplicate protection intact." };
}
