import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  hasAlreadySentPaperwork,
  loadP243IdempotencyStore,
  normalizeEmailFingerprint,
  type P243IdempotencyStoreFile,
} from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import {
  displayName,
  normalizePhone,
  type P242DiscoveredApplicant,
} from "@/lib/p242-open-store-paperwork-push/discover";
import {
  P242_MAX_MILES,
  type P242BlockReason,
  type P242CandidateMatch,
  type P242PreviewSummary,
} from "@/lib/p242-open-store-paperwork-push/types";

/** Known canary sends from open-stores live push (must exclude). */
export const P242_KNOWN_CANARY_SENT_IDS = new Set([
  "f84925d2226a", // Ashley Nicole cross
  "8b248f4f045c", // Shanyn Pough
  "8e51a3531ac4", // Diandra Martinez
]);

const TERMINAL = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Withdrawn",
  "Archived",
]);

const ACTIONABLE = new Set(["Applied", "Needs Review", "Qualified", "Paperwork Needed"]);

function stageOf(c: BreezyCandidate, wf: CandidateWorkflowRecord | null): string {
  return String(wf?.workflowStatus ?? c.stage ?? "Applied").trim() || "Applied";
}

function paperworkOf(wf: CandidateWorkflowRecord | null): string {
  return String(wf?.paperworkStatus ?? "not_sent").trim() || "not_sent";
}

function emailOf(c: BreezyCandidate, wf: CandidateWorkflowRecord | null): string | null {
  const email = String(c.email ?? wf?.onboardingContactEmail ?? "").trim();
  return email.includes("@") ? email : null;
}

/**
 * Classify open-store applicants into eligible / blocked with explicit reasons.
 * Uses P241-aware posture: stale actionType alone does not block when stage is
 * still intake and no active packet — forceFreshReset handles scoring later.
 */
export async function classifyP242Candidates(input: {
  applicants: P242DiscoveredApplicant[];
  approveOver60Ids?: string[];
}): Promise<{
  candidates: P242CandidateMatch[];
  eligible: P242CandidateMatch[];
  blocked: P242CandidateMatch[];
  notes: string[];
}> {
  const notes: string[] = [];
  const approveOver60 = new Set(input.approveOver60Ids ?? []);
  const idempotency = await loadP243IdempotencyStore();
  const pilot = await loadPilotSendRegistry();
  const pilotSentIds = new Set(
    (pilot.sends ?? [])
      .map((s: { candidateId?: string }) => String(s.candidateId ?? "").trim())
      .filter(Boolean),
  );

  // Identity maps for duplicate detection across the discovered cohort
  const emailOwners = new Map<string, string>();
  const phoneOwners = new Map<string, string>();
  const nameEmailOwners = new Map<string, string>();

  for (const row of input.applicants) {
    const id = row.candidate.candidateId;
    const email = emailOf(row.candidate, row.workflow);
    const phone = normalizePhone(row.candidate.phone);
    const emailFp = normalizeEmailFingerprint(email);
    if (emailFp && !emailOwners.has(emailFp)) emailOwners.set(emailFp, id);
    if (phone && !phoneOwners.has(phone)) phoneOwners.set(phone, id);
    const nameKey = `${displayName(row.candidate).toLowerCase()}|${(email ?? "").toLowerCase()}`;
    if (email && !nameEmailOwners.has(nameKey)) nameEmailOwners.set(nameKey, id);
  }

  const candidates: P242CandidateMatch[] = [];

  for (const row of input.applicants) {
    const c = row.candidate;
    const wf = row.workflow;
    const id = c.candidateId;
    const email = emailOf(c, wf);
    const phone = c.phone ? String(c.phone) : null;
    const workflowStage = stageOf(c, wf);
    const breezyStage = String(c.stage ?? workflowStage);
    const paperworkStatus = paperworkOf(wf);
    const signatureRequestId = String(wf?.signatureRequestId ?? "").trim() || null;
    const blockReasons: P242BlockReason[] = [];
    const details: string[] = [];

    const canaryKnownSent =
      P242_KNOWN_CANARY_SENT_IDS.has(id) || pilotSentIds.has(id);
    const idempo = hasAlreadySentPaperwork(idempotency, id, email);

    if (canaryKnownSent || idempo.blocked) {
      blockReasons.push("already_sent");
      details.push(
        canaryKnownSent
          ? "known_canary_or_pilot_sent"
          : idempo.reason ?? "idempotency_already_sent",
      );
    }

    if (paperworkStatus === "signed" || workflowStage === "Signed") {
      blockReasons.push("already_signed");
      details.push("signed");
    }

    if (
      paperworkStatus === "sent" ||
      paperworkStatus === "viewed" ||
      workflowStage === "Paperwork Sent" ||
      Boolean(signatureRequestId)
    ) {
      if (!blockReasons.includes("already_sent")) {
        blockReasons.push("already_sent");
        details.push(
          signatureRequestId
            ? `signatureRequestId=${signatureRequestId.slice(0, 12)}`
            : `paperwork=${paperworkStatus} stage=${workflowStage}`,
        );
      }
    }

    if (workflowStage === "Ready for MEL") {
      blockReasons.push("ready_for_mel");
      details.push("Ready for MEL");
    }
    if (workflowStage === "Active Rep" || workflowStage === "Loaded in MEL") {
      blockReasons.push("active_mel");
      details.push(workflowStage);
    }
    if (TERMINAL.has(workflowStage)) {
      blockReasons.push("terminal_stage");
      details.push(workflowStage);
    }

    if (!email) {
      blockReasons.push("missing_email");
      details.push("missing_email");
    }

    // Duplicate identity within cohort or vs already-sent fingerprint owner
    const emailFp = normalizeEmailFingerprint(email);
    if (emailFp) {
      const owner = emailOwners.get(emailFp);
      if (owner && owner !== id) {
        blockReasons.push("duplicate_identity");
        details.push(`email_dup_of=${owner}`);
      }
      const cross = crossIdAlreadySent(idempotency, id, email);
      if (cross) {
        blockReasons.push("identity_conflict");
        details.push(cross);
      }
    }
    const phoneKey = normalizePhone(phone);
    if (phoneKey) {
      const owner = phoneOwners.get(phoneKey);
      if (owner && owner !== id) {
        blockReasons.push("duplicate_identity");
        details.push(`phone_dup_of=${owner}`);
      }
    }

    // Position must match an open-store matched position (discovery already filters;
    // keep defensive check for mismatched names without city).
    if (!row.store.positionId || row.store.positionId !== c.positionId) {
      blockReasons.push("unrelated_position");
      details.push("position_not_on_open_store");
    }

    if (
      row.milesToStore != null &&
      row.milesToStore > P242_MAX_MILES &&
      !approveOver60.has(id)
    ) {
      blockReasons.push("over_60_miles");
      details.push(`miles=${row.milesToStore}`);
    }

    if (!ACTIONABLE.has(workflowStage) && blockReasons.length === 0) {
      blockReasons.push("unsupported_stage");
      details.push(workflowStage);
    }

    // Deduplicate reasons
    const uniqueReasons = [...new Set(blockReasons)];
    const eligibility = uniqueReasons.length === 0 ? "eligible" : "blocked";

    candidates.push({
      candidateId: id,
      name: displayName(c),
      email,
      phone,
      positionId: c.positionId ?? null,
      positionName: c.positionName ?? row.store.positionName,
      storeCity: row.store.storeCity,
      storeState: row.store.storeState,
      storeLabel: row.store.storeLabel,
      districtManager: row.store.districtManager,
      homeCity: c.city ?? null,
      homeState: c.state ?? null,
      breezyStage,
      workflowStage,
      paperworkStatus,
      signatureRequestId,
      actionType: wf?.actionType ?? null,
      assignedRecruiter: String(wf?.assignedRecruiter ?? "Unassigned"),
      assignedDM: String(wf?.assignedDM ?? "Unassigned"),
      matchReason: row.matchReason,
      matchConfidence: row.store.matchConfidence,
      milesToStore: row.milesToStore,
      eligibility,
      blockReasons: uniqueReasons,
      blockDetail: details.length ? details.join("; ") : null,
      alreadySentExclusion: uniqueReasons.includes("already_sent"),
      signedExclusion: uniqueReasons.includes("already_signed"),
      canaryKnownSent,
    });
  }

  const eligible = candidates.filter((c) => c.eligibility === "eligible");
  const blocked = candidates.filter((c) => c.eligibility === "blocked");
  notes.push(
    `Classified ${candidates.length}: eligible=${eligible.length} blocked=${blocked.length}.`,
  );
  notes.push(
    `Already-sent exclusions=${candidates.filter((c) => c.alreadySentExclusion).length}; signed=${candidates.filter((c) => c.signedExclusion).length}.`,
  );

  return { candidates, eligible, blocked, notes };
}

function crossIdAlreadySent(
  store: P243IdempotencyStoreFile,
  candidateId: string,
  email: string | null,
): string | null {
  const hit = hasAlreadySentPaperwork(store, candidateId, email);
  if (hit.blocked && hit.reason === "email_fingerprint_already_sent") {
    return hit.reason;
  }
  return null;
}

export function buildP242PreviewSummary(
  candidates: P242CandidateMatch[],
  openStoresReviewed: number,
): P242PreviewSummary {
  const uniqueIds = new Set(candidates.map((c) => c.candidateId));
  const countReason = (reason: P242BlockReason) =>
    candidates.filter((c) => c.blockReasons.includes(reason)).length;

  const byStoreMap = new Map<
    string,
    { storeLabel: string; districtManager: string; applicants: number; eligible: number; blocked: number }
  >();
  const byDmMap = new Map<
    string,
    { districtManager: string; applicants: number; eligible: number; blocked: number }
  >();

  for (const c of candidates) {
    const sk = c.storeLabel;
    const store = byStoreMap.get(sk) ?? {
      storeLabel: c.storeLabel,
      districtManager: c.districtManager,
      applicants: 0,
      eligible: 0,
      blocked: 0,
    };
    store.applicants += 1;
    if (c.eligibility === "eligible") store.eligible += 1;
    else store.blocked += 1;
    byStoreMap.set(sk, store);

    const dm = c.districtManager || "Unassigned";
    const dmRow = byDmMap.get(dm) ?? {
      districtManager: dm,
      applicants: 0,
      eligible: 0,
      blocked: 0,
    };
    dmRow.applicants += 1;
    if (c.eligibility === "eligible") dmRow.eligible += 1;
    else dmRow.blocked += 1;
    byDmMap.set(dm, dmRow);
  }

  const otherBlocked = candidates.filter(
    (c) =>
      c.eligibility === "blocked" &&
      !c.blockReasons.some((r) =>
        [
          "already_sent",
          "already_signed",
          "missing_email",
          "unrelated_position",
          "over_60_miles",
          "duplicate_identity",
          "identity_conflict",
        ].includes(r),
      ),
  ).length;

  return {
    openStoresReviewed,
    applicantsFound: candidates.length,
    uniqueApplicants: uniqueIds.size,
    eligible: candidates.filter((c) => c.eligibility === "eligible").length,
    alreadySent: countReason("already_sent"),
    alreadySigned: countReason("already_signed"),
    missingEmail: countReason("missing_email"),
    positionMismatch: countReason("unrelated_position"),
    over60Miles: countReason("over_60_miles"),
    duplicates: candidates.filter(
      (c) =>
        c.blockReasons.includes("duplicate_identity") ||
        c.blockReasons.includes("identity_conflict"),
    ).length,
    otherBlocked,
    byStore: [...byStoreMap.values()].sort((a, b) => b.applicants - a.applicants),
    byDM: [...byDmMap.values()].sort((a, b) => b.applicants - a.applicants),
  };
}
