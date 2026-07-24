import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { geocodeKey, getCachedGeocode } from "@/lib/geocoding/geocode-cache";
import { resolveCoordinates } from "@/lib/geocoding/geocoder";
import {
  classifyP235ProximityExclusion,
  evaluateP235Proximity,
  type P235OppPoint,
} from "@/lib/p235-controlled-newest-five-send/eligibility";
import { resolveP235AuthoritativeDm } from "@/lib/p235-controlled-newest-five-send/dm";
import {
  p239DisplayName,
  p239HasUsableEmail,
  p239HasUsablePhone,
  p239IsCalvinBrown,
  p239IsTerminalOrArchived,
  p239NormalizeEmail,
  p239RedactId,
} from "@/lib/p239-final-remaining-auto-eligible-send/cohort";
import {
  P239_MAX_BATCH,
  P239_PHASE,
  P239_REQUIRED_PAPERWORK_STATUS,
  P239_REQUIRED_RECRUITER,
  P239_REQUIRED_START_STAGE,
  P239_TARGET_PN_STAGE,
  type P239EvaluatedCandidate,
  type P239ExclusionReason,
  type P239SelectionResult,
} from "@/lib/p239-final-remaining-auto-eligible-send/types";

export type P239OppPoint = P235OppPoint;

function parseMs(raw: string | null | undefined): number {
  const ms = Date.parse(String(raw ?? ""));
  return Number.isFinite(ms) ? ms : 0;
}

async function resolveHomePoint(input: {
  city: string;
  state: string;
  zip?: string;
  allowNetwork: boolean;
}): Promise<{ lat: number; lng: number } | null> {
  const city = input.city.trim();
  const state = input.state.trim().toUpperCase();
  if (!city || !state) return null;

  const key = geocodeKey({ city, state, zip: input.zip });
  const keyNoZip = geocodeKey({ city, state });
  const cached =
    (await getCachedGeocode(key)) ??
    (keyNoZip !== key ? await getCachedGeocode(keyNoZip) : null);
  if (cached && cached.source === "nominatim") {
    return { lat: cached.lat, lng: cached.lng };
  }

  if (!input.allowNetwork) {
    if (cached) return { lat: cached.lat, lng: cached.lng };
    return null;
  }

  const resolved = await resolveCoordinates(
    { city, state, zip: input.zip },
    { allowNetwork: true },
  );
  if (!resolved) return cached ? { lat: cached.lat, lng: cached.lng } : null;
  if (resolved.source !== "nominatim") return null;
  return { lat: resolved.lat, lng: resolved.lng };
}

/**
 * Newest-first selection from P238 batch_full seed pool only.
 * Excludes prior P221/P227/P235/P237/P238 sends. Selects ≤7 auto-eligible.
 * Start stage may be Applied (promote later) or already Paperwork Needed.
 */
export async function selectP239FinalRemaining(input: {
  batchFullCandidateIds: string[];
  priorExcluded: {
    p221: Set<string>;
    p227: Set<string>;
    p235: Set<string>;
    p237: Set<string>;
    p238: Set<string>;
  };
  workflows: Record<string, CandidateWorkflowRecord>;
  candidatesById: Map<string, BreezyCandidate>;
  jobsByPositionId: Map<string, BreezyJob>;
  policy: CandidateOnboardingPolicy;
  opportunityPoints: P239OppPoint[];
  allowNetworkGeocode?: boolean;
}): Promise<P239SelectionResult> {
  const allowNetwork = input.allowNetworkGeocode ?? true;
  const seedIds = [...new Set(input.batchFullCandidateIds.map((id) => id.trim()).filter(Boolean))];

  const emailOwners = new Map<string, string>();
  for (const id of seedIds) {
    if (
      input.priorExcluded.p221.has(id) ||
      input.priorExcluded.p227.has(id) ||
      input.priorExcluded.p235.has(id) ||
      input.priorExcluded.p237.has(id) ||
      input.priorExcluded.p238.has(id)
    ) {
      continue;
    }
    const candidate = input.candidatesById.get(id);
    const email = p239NormalizeEmail(candidate?.email);
    if (!email) continue;
    if (!emailOwners.has(email)) emailOwners.set(email, id);
  }

  const ranked = seedIds
    .map((candidateId) => {
      const candidate = input.candidatesById.get(candidateId);
      const appliedDate = candidate?.appliedDate || candidate?.addedDate || "";
      return { candidateId, appliedDate, appliedMs: parseMs(appliedDate) };
    })
    .sort((a, b) => b.appliedMs - a.appliedMs);

  const selected: P239EvaluatedCandidate[] = [];
  const exclusions: P239SelectionResult["exclusions"] = [];
  const evaluatedNewestFirst: P239SelectionResult["evaluatedNewestFirst"] = [];
  const evaluated: P239EvaluatedCandidate[] = [];
  let eligibleCount = 0;

  const exclude = (
    row: P239EvaluatedCandidate,
    reason: P239ExclusionReason,
    detail: string,
  ) => {
    row.selected = false;
    row.exclusionReason = reason;
    row.exclusionDetail = detail;
    exclusions.push({
      candidateId: row.candidateId,
      redactedCandidateId: row.redactedCandidateId,
      displayName: row.displayName,
      appliedDate: row.appliedDate,
      reason,
      detail,
    });
    evaluatedNewestFirst.push({
      candidateId: row.candidateId,
      redactedCandidateId: row.redactedCandidateId,
      displayName: row.displayName,
      appliedDate: row.appliedDate,
      selected: false,
      exclusionReason: reason,
    });
  };

  for (const { candidateId, appliedDate } of ranked) {
    const workflow = input.workflows[candidateId];
    const candidate = input.candidatesById.get(candidateId);
    const displayName = candidate
      ? p239DisplayName({
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          candidateId,
        })
      : candidateId;
    const redacted = p239RedactId(candidateId);

    const base: P239EvaluatedCandidate = {
      candidateId,
      redactedCandidateId: redacted,
      displayName,
      email: String(candidate?.email ?? "").trim(),
      phone: String(candidate?.phone ?? "").trim(),
      appliedDate,
      city: String(candidate?.city ?? "").trim(),
      state: String(candidate?.state ?? "").trim().toUpperCase(),
      zip: String(candidate?.zipCode ?? "").trim(),
      positionId: String(candidate?.positionId ?? "").trim(),
      positionName: String(candidate?.positionName ?? "").trim(),
      assignedRecruiter: String(workflow?.assignedRecruiter ?? "Unassigned"),
      assignedDMBefore: String(workflow?.assignedDM ?? "Unassigned"),
      workflowStage: String(workflow?.workflowStatus ?? ""),
      paperworkStatus: String(workflow?.paperworkStatus ?? "not_sent"),
      signatureRequestId: workflow?.signatureRequestId ?? null,
      dm: {
        ok: false,
        proposedAssignedDM: null,
        expectedDmFromRouting: null,
        routingState: null,
        positionId: null,
        positionCity: null,
        positionState: null,
        locationSource: null,
        authoritative: false,
        wouldChange: false,
        reason: null,
      },
      proximity: null,
      canPromoteP656: false,
      selected: false,
      exclusionReason: null,
      exclusionDetail: null,
    };

    if (input.priorExcluded.p221.has(candidateId)) {
      exclude(base, "prior_batch_p221", "Excluded: already sent in P221");
      evaluated.push(base);
      continue;
    }
    if (input.priorExcluded.p227.has(candidateId)) {
      exclude(base, "prior_batch_p227", "Excluded: already sent in P227");
      evaluated.push(base);
      continue;
    }
    if (input.priorExcluded.p235.has(candidateId)) {
      exclude(base, "prior_batch_p235", "Excluded: already sent in P235");
      evaluated.push(base);
      continue;
    }
    if (input.priorExcluded.p237.has(candidateId)) {
      exclude(base, "prior_batch_p237", "Excluded: already sent in P237");
      evaluated.push(base);
      continue;
    }
    if (input.priorExcluded.p238.has(candidateId)) {
      exclude(base, "prior_batch_p238", "Excluded: already sent in P238");
      evaluated.push(base);
      continue;
    }
    if (p239IsCalvinBrown(displayName)) {
      exclude(base, "calvin_brown_excluded", "Hard exclusion: Calvin Brown");
      evaluated.push(base);
      continue;
    }
    if (!workflow) {
      exclude(base, "missing_workflow", "Missing durable workflow record");
      evaluated.push(base);
      continue;
    }
    if (!candidate) {
      exclude(base, "missing_ingestion", "Missing durable ingestion record");
      evaluated.push(base);
      continue;
    }
    if (p239IsTerminalOrArchived(workflow.workflowStatus, workflow.notes ?? [])) {
      exclude(base, "terminal_or_archived", `stage=${workflow.workflowStatus}`);
      evaluated.push(base);
      continue;
    }
    if (/\brejected\b|\bwithdrawn\b/i.test((workflow.notes ?? []).join("\n"))) {
      exclude(base, "rejected_or_withdrawn", "notes contain rejected/withdrawn");
      evaluated.push(base);
      continue;
    }
    if (String(workflow.assignedRecruiter ?? "").trim() !== P239_REQUIRED_RECRUITER) {
      exclude(
        base,
        "recruiter_not_taylor",
        `assignedRecruiter=${workflow.assignedRecruiter ?? "Unassigned"}`,
      );
      evaluated.push(base);
      continue;
    }
    // Eligible start: Applied (promote to PN) or already Paperwork Needed.
    if (
      String(workflow.workflowStatus) !== P239_REQUIRED_START_STAGE &&
      String(workflow.workflowStatus) !== P239_TARGET_PN_STAGE
    ) {
      exclude(base, "stage_not_eligible", `stage=${workflow.workflowStatus}`);
      evaluated.push(base);
      continue;
    }
    if (
      String(workflow.paperworkStatus ?? "not_sent") !== P239_REQUIRED_PAPERWORK_STATUS ||
      Boolean(String(workflow.signatureRequestId ?? "").trim()) ||
      Boolean(workflow.paperworkSentAt) ||
      Boolean(workflow.paperworkSignedAt)
    ) {
      exclude(
        base,
        "already_sent_or_signed",
        `paperwork=${workflow.paperworkStatus} sig=${workflow.signatureRequestId ?? "null"}`,
      );
      evaluated.push(base);
      continue;
    }
    if (!displayName || /^unknown/i.test(displayName)) {
      exclude(base, "missing_identity", "display name missing");
      evaluated.push(base);
      continue;
    }
    if (!p239HasUsableEmail(candidate.email)) {
      exclude(base, "missing_email", "email missing or invalid");
      evaluated.push(base);
      continue;
    }
    if (!p239HasUsablePhone(candidate.phone)) {
      exclude(base, "missing_phone", "phone missing or <10 digits");
      evaluated.push(base);
      continue;
    }
    const email = p239NormalizeEmail(candidate.email);
    const emailOwner = emailOwners.get(email);
    if (emailOwner && emailOwner !== candidateId) {
      exclude(base, "duplicate_identity", `duplicate email owned by ${p239RedactId(emailOwner)}`);
      evaluated.push(base);
      continue;
    }
    if (!base.positionId) {
      exclude(base, "missing_position_id", "positionId missing");
      evaluated.push(base);
      continue;
    }

    const job = input.jobsByPositionId.get(base.positionId) ?? null;
    const dm = resolveP235AuthoritativeDm({
      currentAssignedDM: String(workflow.assignedDM ?? "Unassigned"),
      positionId: base.positionId,
      positionName: base.positionName,
      homeCity: base.city,
      homeState: base.state,
      job,
    });
    base.dm = dm;

    if (!dm.ok || !dm.proposedAssignedDM) {
      const reason: P239ExclusionReason =
        dm.reason === "position_location_not_authoritative"
          ? "position_location_not_authoritative"
          : dm.reason === "dm_conflict_or_ambiguous"
            ? "dm_ambiguous"
            : dm.reason === "missing_position_id"
              ? "missing_position_id"
              : "dm_unresolvable";
      exclude(base, reason, dm.reason ?? "dm resolution failed");
      evaluated.push(base);
      continue;
    }

    const projectedWorkflow: CandidateWorkflowRecord = {
      ...workflow,
      assignedDM: dm.proposedAssignedDM,
    };
    const alreadyPn = String(workflow.workflowStatus) === P239_TARGET_PN_STAGE;
    const scored = buildScoredWorkflowRow(candidate, projectedWorkflow);
    const canPromote = alreadyPn
      ? true
      : canPromoteToPaperworkFunnel(scored, {
          ...input.policy,
          funnelPromotion: { enabled: true },
        });
    base.canPromoteP656 = canPromote;
    if (!canPromote) {
      exclude(base, "qualification_gate_failed", "P65.6 canPromoteToPaperworkFunnel=false");
      evaluated.push(base);
      continue;
    }

    const home = await resolveHomePoint({
      city: base.city,
      state: base.state,
      zip: base.zip,
      allowNetwork,
    });
    const proximity = evaluateP235Proximity({
      home,
      assignedDm: dm.proposedAssignedDM,
      expectedDm: dm.expectedDmFromRouting ?? dm.proposedAssignedDM,
      jobCity: dm.positionCity ?? base.city,
      jobState: dm.positionState ?? base.state,
      opportunities: input.opportunityPoints,
    });
    base.proximity = proximity;

    const proxEx = classifyP235ProximityExclusion(proximity);
    if (proxEx.reason) {
      exclude(base, proxEx.reason as P239ExclusionReason, proxEx.detail);
      evaluated.push(base);
      continue;
    }

    eligibleCount += 1;

    if (selected.length >= P239_MAX_BATCH) {
      exclude(base, "batch_full", `already selected ${P239_MAX_BATCH} newest auto-eligible`);
      evaluated.push(base);
      continue;
    }

    base.selected = true;
    selected.push(base);
    evaluated.push(base);
    evaluatedNewestFirst.push({
      candidateId: base.candidateId,
      redactedCandidateId: base.redactedCandidateId,
      displayName: base.displayName,
      appliedDate: base.appliedDate,
      selected: true,
      exclusionReason: null,
    });
  }

  return {
    phase: P239_PHASE,
    generatedAt: new Date().toISOString(),
    p238BatchFullPoolSize: seedIds.length,
    priorExcludedCount:
      input.priorExcluded.p221.size +
      input.priorExcluded.p227.size +
      input.priorExcluded.p235.size +
      input.priorExcluded.p237.size +
      input.priorExcluded.p238.size,
    priorExcluded: {
      p221: input.priorExcluded.p221.size,
      p227: input.priorExcluded.p227.size,
      p235: input.priorExcluded.p235.size,
      p237: input.priorExcluded.p237.size,
      p238: input.priorExcluded.p238.size,
    },
    evaluatedCount: evaluated.length,
    selectedCount: selected.length,
    eligibleCount,
    maxBatch: P239_MAX_BATCH,
    selected,
    exclusions,
    evaluatedNewestFirst,
  };
}
