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
  p235DisplayName,
  p235HasUsableEmail,
  p235HasUsablePhone,
  p235IsCalvinBrown,
  p235IsTerminalOrArchived,
  p235NormalizeEmail,
  p235RedactId,
} from "@/lib/p235-controlled-newest-five-send/cohort";
import {
  P235_MAX_BATCH,
  P235_PHASE,
  P235_REQUIRED_PAPERWORK_STATUS,
  P235_REQUIRED_RECRUITER,
  P235_REQUIRED_START_STAGE,
  type P235EvaluatedCandidate,
  type P235ExclusionReason,
  type P235SelectionResult,
} from "@/lib/p235-controlled-newest-five-send/types";

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
  if (cached && (cached.source === "nominatim" || cached.source === "estimate")) {
    // Prefer nominatim; allow estimate only as last resort for coverageKnown.
    if (cached.source === "nominatim") {
      return { lat: cached.lat, lng: cached.lng };
    }
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
  // Only accept nominatim for auto-eligibility coverage.
  if (resolved.source !== "nominatim") {
    return null;
  }
  return { lat: resolved.lat, lng: resolved.lng };
}

/**
 * Newest-first selection from P234 frozen cohort. Selects ≤5 that pass every gate
 * after projected authoritative DM resolution + proximity auto-eligibility.
 */
export async function selectP235NewestFive(input: {
  frozenIds: string[];
  ingestionGapIds: Set<string>;
  workflows: Record<string, CandidateWorkflowRecord>;
  candidatesById: Map<string, BreezyCandidate>;
  jobsByPositionId: Map<string, BreezyJob>;
  policy: CandidateOnboardingPolicy;
  opportunityPoints: P235OppPoint[];
  allowNetworkGeocode?: boolean;
}): Promise<P235SelectionResult> {
  const allowNetwork = input.allowNetworkGeocode ?? true;
  const emailOwners = new Map<string, string>();
  for (const id of input.frozenIds) {
    const candidate = input.candidatesById.get(id);
    const email = p235NormalizeEmail(candidate?.email);
    if (!email) continue;
    if (!emailOwners.has(email)) emailOwners.set(email, id);
  }

  const ranked = [...input.frozenIds]
    .map((candidateId) => {
      const candidate = input.candidatesById.get(candidateId);
      const appliedDate = candidate?.appliedDate || candidate?.addedDate || "";
      return { candidateId, appliedDate, appliedMs: parseMs(appliedDate) };
    })
    .sort((a, b) => b.appliedMs - a.appliedMs);

  const selected: P235EvaluatedCandidate[] = [];
  const exclusions: P235SelectionResult["exclusions"] = [];
  const evaluatedNewestFirst: P235SelectionResult["evaluatedNewestFirst"] = [];
  const evaluated: P235EvaluatedCandidate[] = [];

  const exclude = (
    row: P235EvaluatedCandidate,
    reason: P235ExclusionReason,
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
      ? p235DisplayName({
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          candidateId,
        })
      : candidateId;
    const redacted = p235RedactId(candidateId);

    const base: P235EvaluatedCandidate = {
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

    if (input.ingestionGapIds.has(candidateId)) {
      exclude(base, "ingestion_gap", "P234 ingestion-gap candidate — not handled in P235");
      evaluated.push(base);
      continue;
    }
    if (p235IsCalvinBrown(displayName)) {
      exclude(base, "calvin_brown_excluded", "Hard exclusion: Calvin Brown");
      evaluated.push(base);
      continue;
    }
    if (!candidate || !workflow) {
      exclude(base, "ingestion_gap", "Missing durable ingestion or workflow record");
      evaluated.push(base);
      continue;
    }
    if (p235IsTerminalOrArchived(workflow.workflowStatus, workflow.notes ?? [])) {
      exclude(base, "terminal_or_archived", `stage=${workflow.workflowStatus}`);
      evaluated.push(base);
      continue;
    }
    if (/\brejected\b|\bwithdrawn\b/i.test((workflow.notes ?? []).join("\n"))) {
      exclude(base, "rejected_or_withdrawn", "notes contain rejected/withdrawn");
      evaluated.push(base);
      continue;
    }
    if (String(workflow.assignedRecruiter ?? "").trim() !== P235_REQUIRED_RECRUITER) {
      exclude(
        base,
        "recruiter_not_taylor",
        `assignedRecruiter=${workflow.assignedRecruiter ?? "Unassigned"}`,
      );
      evaluated.push(base);
      continue;
    }
    if (String(workflow.workflowStatus) !== P235_REQUIRED_START_STAGE) {
      exclude(base, "stage_not_applied", `stage=${workflow.workflowStatus}`);
      evaluated.push(base);
      continue;
    }
    if (
      String(workflow.paperworkStatus ?? "not_sent") !== P235_REQUIRED_PAPERWORK_STATUS ||
      Boolean(String(workflow.signatureRequestId ?? "").trim()) ||
      Boolean(workflow.paperworkSentAt)
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
    if (!p235HasUsableEmail(candidate.email)) {
      exclude(base, "missing_email", "email missing or invalid");
      evaluated.push(base);
      continue;
    }
    if (!p235HasUsablePhone(candidate.phone)) {
      exclude(base, "missing_phone", "phone missing or <10 digits");
      evaluated.push(base);
      continue;
    }
    const email = p235NormalizeEmail(candidate.email);
    const emailOwner = emailOwners.get(email);
    if (emailOwner && emailOwner !== candidateId) {
      exclude(base, "duplicate_identity", `duplicate email owned by ${p235RedactId(emailOwner)}`);
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
      const reason: P235ExclusionReason =
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

    // Overlay projected DM for qualification / proximity checks
    const projectedWorkflow: CandidateWorkflowRecord = {
      ...workflow,
      assignedDM: dm.proposedAssignedDM,
    };
    const scored = buildScoredWorkflowRow(candidate, projectedWorkflow);
    const canPromote = canPromoteToPaperworkFunnel(scored, {
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
      exclude(base, proxEx.reason, proxEx.detail);
      evaluated.push(base);
      continue;
    }

    if (selected.length >= P235_MAX_BATCH) {
      exclude(base, "batch_full", `already selected ${P235_MAX_BATCH} newest auto-eligible`);
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
    phase: P235_PHASE,
    generatedAt: new Date().toISOString(),
    frozenCohortSize: input.frozenIds.length,
    evaluatedCount: evaluated.length,
    selectedCount: selected.length,
    maxBatch: P235_MAX_BATCH,
    selected,
    exclusions,
    evaluatedNewestFirst,
  };
}
