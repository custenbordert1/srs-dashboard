import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { geocodeKey, getCachedGeocode } from "@/lib/geocoding/geocode-cache";
import { resolveCoordinates } from "@/lib/geocoding/geocoder";
import { isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import {
  classifyP235ProximityExclusion,
  evaluateP235Proximity,
  type P235OppPoint,
} from "@/lib/p235-controlled-newest-five-send/eligibility";
import { resolveP235AuthoritativeDm } from "@/lib/p235-controlled-newest-five-send/dm";
import {
  p240DisplayName,
  p240HasUsableEmail,
  p240HasUsablePhone,
  p240IsCalvinBrown,
  p240IsTerminalOrArchived,
  p240NormalizeEmail,
  p240ParseMs,
  p240RedactId,
} from "@/lib/p240-autonomous-new-applicant-pipeline/cohort";
import {
  refreshBreezyCandidateData,
  resetToFreshNewState,
  validateP240FreshNewReset,
} from "@/lib/p240-autonomous-new-applicant-pipeline/freshness";
import {
  P240_LOOKBACK_DAYS,
  P240_MAX_PROXY_COHORT,
  P240_MIN_PROXY_COHORT,
  P240_SIMULATION_HORIZON_HOURS,
  type P240BlockerCode,
  type P240CandidateTrace,
  type P240CohortKind,
  type P240CutoffResolution,
  type P240FreshnessTrace,
  type P240PipelineStep,
  type P240QueueLocation,
  type P240SimOutcome,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";

export {
  P240_FRESH_NEW_REPLAY_ACTION_FIELDS,
  P240_FRESH_NEW_REPLAY_ASSIGNMENT_FIELDS,
  P240_FRESH_NEW_REPLAY_PACKET_FIELDS,
  applyP240FreshNewReplayReset,
  expectedFreshNewStateHash,
  findLeftoverStaleFreshNewFields,
  hashP240FreshnessState,
  refreshBreezyCandidateData,
  resetToFreshNewState,
  snapshotP240FreshnessState,
  validateP240FreshNewReset,
} from "@/lib/p240-autonomous-new-applicant-pipeline/freshness";
export type {
  P240FreshnessStateSnapshot,
  P240FreshnessValidation,
  RefreshBreezyCandidateResult,
} from "@/lib/p240-autonomous-new-applicant-pipeline/freshness";

export type P240OppPoint = P235OppPoint;

const PAST_SENT = new Set([
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

/** Nominal autonomous cycle minutes per completed step (dry-run estimate). */
const STEP_MINUTES: Record<P240PipelineStep, number> = {
  ingested: 5,
  recruiter_assigned: 8,
  qualified: 12,
  dm_assigned: 4,
  proximity_ok: 3,
  paperwork_needed: 6,
  dropbox_sign_simulated: 10,
  paperwork_sent_simulated: 2,
};

function alreadySentOrSigned(workflow: CandidateWorkflowRecord | undefined): boolean {
  if (!workflow) return false;
  const stage = String(workflow.workflowStatus ?? "");
  const paperwork = String(workflow.paperworkStatus ?? "not_sent");
  if (PAST_SENT.has(stage)) return true;
  if (paperwork === "sent" || paperwork === "viewed" || paperwork === "signed") return true;
  if (String(workflow.signatureRequestId ?? "").trim()) return true;
  if (workflow.paperworkSentAt || workflow.paperworkSignedAt) return true;
  return false;
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

function estimateMinutes(steps: P240PipelineStep[]): number {
  return steps.reduce((sum, step) => sum + (STEP_MINUTES[step] ?? 0), 0);
}

function nextActionFor(blocker: P240BlockerCode | null, outcome: P240SimOutcome): string {
  if (outcome === "would_send") return "No action — autonomous send path clear (dry-run)";
  if (outcome === "would_reach_paperwork_needed") {
    return "Continue autonomous Dropbox Sign send (live mode gated)";
  }
  if (outcome === "protected_skip") return "Do not modify — already sent/signed or prior batch";
  switch (blocker) {
    case "awaiting_recruiter_assignment":
    case "recruiter_resolution_failed":
      return "Resolve recruiter via P158 assignment engine";
    case "manual_recruiter_override_protected":
      return "Respect manual recruiter ownership — operator review";
    case "awaiting_qualification":
    case "qualification_gate_failed":
      return "Complete qualification / grade gate (P65.6)";
    case "awaiting_dm_assignment":
    case "dm_unresolvable":
    case "dm_ambiguous":
    case "position_location_not_authoritative":
      return "Resolve authoritative DM via P216 position location";
    case "manual_review_40_60":
      return "Operator distance review (40–60 mi)";
    case "blocked_over_60":
      return "Out of range — do not auto-send";
    case "coverage_unknown":
    case "no_active_work":
      return "Resolve coverage / active MEL work proximity";
    case "not_ingested":
      return "Wait for durable Breezy ingestion";
    case "missing_workflow":
      return "Ensure workflow record is created on ingest";
    case "duplicate_identity":
      return "Deduplicate identity — never resend";
    case "missing_email":
    case "missing_phone":
    case "missing_identity":
    case "missing_location":
    case "missing_position":
      return `Remediate data quality: ${blocker}`;
    case "terminal_or_archived":
      return "Terminal — exclude from autonomous pipeline";
    case "operator_excluded":
    case "calvin_brown_excluded":
      return "Honor operator exclusion";
    case "recovery_protected":
      return "Recovery protection active — no autonomous mutation";
    default:
      return "Record blocker and route to operator queue";
  }
}

function queueFor(
  outcome: P240SimOutcome,
  blocker: P240BlockerCode | null,
): P240QueueLocation {
  if (outcome === "would_send") return "would_send";
  if (outcome === "would_reach_paperwork_needed") return "reached_paperwork_needed";
  if (outcome === "protected_skip") return "protected_already_sent";
  switch (blocker) {
    case "awaiting_recruiter_assignment":
    case "recruiter_resolution_failed":
    case "manual_recruiter_override_protected":
      return "awaiting_recruiter";
    case "awaiting_qualification":
    case "qualification_gate_failed":
      return "awaiting_qualification";
    case "awaiting_dm_assignment":
    case "dm_unresolvable":
    case "dm_ambiguous":
    case "position_location_not_authoritative":
      return "awaiting_dm";
    case "not_ingested":
    case "missing_workflow":
      return "new_applicants_waiting";
    default:
      return "blocked";
  }
}

/**
 * Simulate autonomous path for one candidate (in-memory only).
 * When `replayAsFreshNew` is true, treat as a brand-new Applied arrival
 * (ignores current sent stage for path measurement) while still never writing.
 * Always applies {@link resetToFreshNewState} + pre/post hash validation on replay.
 */
export async function simulateP240CandidatePath(input: {
  candidateId: string;
  candidate: BreezyCandidate | undefined;
  workflow: CandidateWorkflowRecord | undefined;
  job: BreezyJob | null;
  policy: CandidateOnboardingPolicy;
  opportunityPoints: P240OppPoint[];
  priorSent: Set<string>;
  proposedRecruiter: string | null;
  recruiterConfidence: number | null;
  emailOwners: Map<string, string>;
  cohortKind: P240CohortKind;
  replayAsFreshNew: boolean;
  allowNetworkGeocode?: boolean;
  inRecoveryStore?: boolean;
  /**
   * When true (or when replayAsFreshNew), attempt read-only Breezy/cache refresh
   * before path simulation. Never writes durable stores.
   * Alias: forceFreshReset (preferred name).
   */
  forceFreshData?: boolean;
  forceFreshReset?: boolean;
  /** Disable network for Breezy enrichment (tests / offline). Default follows geocode flag. */
  allowNetworkBreezyRefresh?: boolean;
}): Promise<P240CandidateTrace> {
  const allowNetwork = input.allowNetworkGeocode ?? true;
  const simulationNotes: string[] = [];
  let freshness: P240FreshnessTrace | null = null;
  let candidate = input.candidate;

  const shouldRefresh = Boolean(
    input.forceFreshReset || input.forceFreshData || input.replayAsFreshNew,
  );
  if (shouldRefresh && candidate) {
    const refresh = await refreshBreezyCandidateData(input.candidateId, {
      seed: candidate,
      allowNetwork: input.allowNetworkBreezyRefresh ?? allowNetwork,
    });
    if (refresh.candidate) {
      candidate = refresh.candidate;
    }
    simulationNotes.push(`breezy_refresh:${refresh.source} — ${refresh.note}`);
    freshness = {
      preResetHash: null,
      postResetHash: null,
      hashMismatch: false,
      leftoverStaleFields: [],
      notes: [],
      breezyRefreshSource: refresh.source,
      breezyRefreshNote: refresh.note,
      freshResetApplied: false,
    };
  } else if (input.replayAsFreshNew) {
    simulationNotes.push("breezy_refresh:skipped — no candidate seed available");
  }

  const displayName = candidate
    ? p240DisplayName({
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        candidateId: input.candidateId,
      })
    : input.candidateId;
  const redacted = p240RedactId(input.candidateId);
  const appliedDate = candidate?.appliedDate || candidate?.addedDate || null;
  const city = String(candidate?.city ?? "").trim();
  const state = String(candidate?.state ?? "").trim().toUpperCase();
  const zip = String(candidate?.zipCode ?? "").trim();
  const positionId = String(candidate?.positionId ?? "").trim();
  const positionName = String(candidate?.positionName ?? "").trim();

  const steps: P240PipelineStep[] = [];
  let blocker: P240BlockerCode | null = null;
  let blockerDetail: string | null = null;
  let outcome: P240SimOutcome = "blocked";
  let simulatedRecruiter: string | null = null;
  let simulatedDm: string | null = null;
  let nearestMiles: number | null = null;
  let coverageTier: string | null = null;

  const finish = (): P240CandidateTrace => {
    const queueLocation = queueFor(outcome, blocker);
    return {
      candidateId: input.candidateId,
      redactedCandidateId: redacted,
      displayName,
      cohortKind: input.cohortKind,
      appliedDate,
      city,
      state,
      positionId,
      positionName,
      currentStage: String(input.workflow?.workflowStatus ?? "NO_WORKFLOW"),
      paperworkStatus: String(input.workflow?.paperworkStatus ?? "not_sent"),
      assignedRecruiterBefore: String(input.workflow?.assignedRecruiter ?? "Unassigned"),
      assignedRecruiterSimulated: simulatedRecruiter,
      assignedDMBefore: String(input.workflow?.assignedDM ?? "Unassigned"),
      assignedDMSimulated: simulatedDm,
      nearestMiles,
      coverageTier,
      stepsCompleted: steps,
      queueLocation,
      outcome,
      blocker,
      blockerDetail,
      nextAction: nextActionFor(blocker, outcome),
      estimatedMinutesAppliedToPaperwork:
        outcome === "would_send" || outcome === "would_reach_paperwork_needed"
          ? estimateMinutes(steps)
          : null,
      freshness,
      simulationNotes: [...simulationNotes],
    };
  };

  // Never resend / never mutate already-sent (unless pure replay simulation).
  if (!input.replayAsFreshNew) {
    if (input.priorSent.has(input.candidateId)) {
      blocker = "prior_batch_sent";
      blockerDetail = "Excluded: already sent in prior controlled batch (P221–P239)";
      outcome = "protected_skip";
      return finish();
    }
    if (alreadySentOrSigned(input.workflow)) {
      blocker = "already_sent_or_signed";
      blockerDetail = `stage=${input.workflow?.workflowStatus} paperwork=${input.workflow?.paperworkStatus}`;
      outcome = "protected_skip";
      return finish();
    }
  } else if (input.priorSent.has(input.candidateId) && alreadySentOrSigned(input.workflow)) {
    // Replay still documents protection rule but continues path as fresh Applied.
    // (outcome remains path-based; protection noted only if path fails early)
  }

  if (input.inRecoveryStore && !input.replayAsFreshNew) {
    // Soft note only — recovery store presence does not hard-block new arrivals.
  }

  if (!candidate) {
    blocker = "not_ingested";
    blockerDetail = "Missing durable ingestion record";
    return finish();
  }
  steps.push("ingested");

  if (!input.workflow && !input.replayAsFreshNew) {
    blocker = "missing_workflow";
    blockerDetail = "Missing durable workflow record";
    return finish();
  }

  if (p240IsCalvinBrown(displayName)) {
    blocker = "calvin_brown_excluded";
    blockerDetail = "Hard operator exclusion: Calvin Brown";
    return finish();
  }

  const baseWorkflow: CandidateWorkflowRecord = input.workflow
    ? { ...input.workflow }
    : {
        candidateId: input.candidateId,
        workflowStatus: "Applied",
        assignedRecruiter: "Unassigned",
        assignedDM: "Unassigned",
        notes: [],
        history: [],
        lastActionAt: null,
        nextActionNeeded: "Review",
        recruitingActions: emptyRecruitingActions(),
        followUpDueAt: null,
        snoozedUntil: null,
        paperworkStatus: "not_sent",
        signatureRequestId: null,
        paperworkTemplateKey: null,
        paperworkSentAt: null,
        paperworkViewedAt: null,
        paperworkViewCount: 0,
        paperworkSignedAt: null,
        paperworkError: null,
        onboardingContactEmail: null,
        directDepositStatus: "not_requested",
        directDepositRequestedAt: null,
        directDepositLastReminderAt: null,
        directDepositNotes: null,
        directDepositTriggeredByUserId: null,
        directDepositLastDeliveryMode: null,
        directDepositLastHrCopyIncluded: null,
        directDepositLastHrBccAddress: null,
        updatedAt: new Date().toISOString(),
      };

  // Replay as fresh: full reset (action/packet/assignment/duplicate/coverage notes).
  // Recruiter/DM are re-resolved below via P158 / P216 — do not keep stale ownership.
  let workingWorkflow = baseWorkflow;
  if (input.replayAsFreshNew) {
    const beforeReset = { ...baseWorkflow };
    workingWorkflow = resetToFreshNewState(baseWorkflow);
    const validation = validateP240FreshNewReset({
      before: beforeReset,
      after: workingWorkflow,
    });
    freshness = {
      preResetHash: validation.preResetHash,
      postResetHash: validation.postResetHash,
      hashMismatch: validation.hashMismatch,
      leftoverStaleFields: validation.leftoverStaleFields,
      notes: validation.notes,
      breezyRefreshSource: freshness?.breezyRefreshSource ?? "skipped",
      breezyRefreshNote: freshness?.breezyRefreshNote ?? null,
      freshResetApplied: !validation.hashMismatch,
    };
    simulationNotes.push(...validation.notes);
    if (validation.hashMismatch) {
      simulationNotes.push(
        `stale_field_hash_mismatch leftover=${validation.leftoverStaleFields.join(",") || "none"}`,
      );
    } else {
      simulationNotes.push("Fresh Reset Applied");
    }
  }

  if (p240IsTerminalOrArchived(workingWorkflow.workflowStatus, workingWorkflow.notes ?? [])) {
    blocker = "terminal_or_archived";
    blockerDetail = `stage=${workingWorkflow.workflowStatus}`;
    return finish();
  }

  if (!displayName || /^unknown/i.test(displayName)) {
    blocker = "missing_identity";
    blockerDetail = "display name missing";
    return finish();
  }
  if (!p240HasUsableEmail(candidate.email)) {
    blocker = "missing_email";
    blockerDetail = "email missing or invalid";
    return finish();
  }
  if (!p240HasUsablePhone(candidate.phone)) {
    blocker = "missing_phone";
    blockerDetail = "phone missing or <10 digits";
    return finish();
  }
  if (!city || !state) {
    blocker = "missing_location";
    blockerDetail = `city=${city || "?"} state=${state || "?"}`;
    return finish();
  }
  if (!positionId && !positionName) {
    blocker = "missing_position";
    blockerDetail = "position missing";
    return finish();
  }

  const email = p240NormalizeEmail(candidate.email);
  const emailOwner = input.emailOwners.get(email);
  if (emailOwner && emailOwner !== input.candidateId) {
    blocker = "duplicate_identity";
    blockerDetail = `duplicate email owned by ${p240RedactId(emailOwner)}`;
    return finish();
  }

  // --- Recruiter assignment (P158 engine preview) ---
  const manualOwned =
    workingWorkflow.recruiterAssignmentSource === "manual" &&
    !isUnassignedRecruiter(workingWorkflow.assignedRecruiter);

  if (manualOwned) {
    simulatedRecruiter = String(workingWorkflow.assignedRecruiter).trim();
    steps.push("recruiter_assigned");
  } else if (!isUnassignedRecruiter(workingWorkflow.assignedRecruiter)) {
    simulatedRecruiter = String(workingWorkflow.assignedRecruiter).trim();
    steps.push("recruiter_assigned");
  } else if (input.proposedRecruiter) {
    simulatedRecruiter = input.proposedRecruiter;
    steps.push("recruiter_assigned");
  } else {
    blocker = "awaiting_recruiter_assignment";
    blockerDetail = `P158 could not resolve recruiter (confidence=${input.recruiterConfidence ?? "n/a"})`;
    return finish();
  }

  // --- DM assignment (P216 / P235 authoritative) ---
  const dm = resolveP235AuthoritativeDm({
    currentAssignedDM: String(workingWorkflow.assignedDM ?? "Unassigned"),
    positionId: positionId || null,
    positionName: positionName || null,
    homeCity: city,
    homeState: state,
    job: input.job,
  });

  if (!dm.ok || !dm.proposedAssignedDM) {
    if (dm.reason === "position_location_not_authoritative") {
      blocker = "position_location_not_authoritative";
    } else if (dm.reason === "dm_conflict_or_ambiguous") {
      blocker = "dm_ambiguous";
    } else if (!positionId) {
      blocker = "missing_position";
    } else {
      blocker = "dm_unresolvable";
    }
    blockerDetail = dm.reason ?? "dm resolution failed";
    return finish();
  }
  simulatedDm = dm.proposedAssignedDM;
  steps.push("dm_assigned");

  // --- Qualification / P65.6 promote ---
  const projected: CandidateWorkflowRecord = {
    ...workingWorkflow,
    assignedRecruiter: simulatedRecruiter,
    assignedDM: simulatedDm,
    workflowStatus: "Applied",
  };
  const scored = buildScoredWorkflowRow(candidate, projected);
  const canPromote = canPromoteToPaperworkFunnel(scored, {
    ...input.policy,
    funnelPromotion: { enabled: true },
  });
  if (!canPromote) {
    blocker = "qualification_gate_failed";
    blockerDetail = "P65.6 canPromoteToPaperworkFunnel=false";
    return finish();
  }
  steps.push("qualified");

  // --- Proximity / distance gates ---
  const home = await resolveHomePoint({
    city,
    state,
    zip,
    allowNetwork,
  });
  const proximity = evaluateP235Proximity({
    home,
    assignedDm: simulatedDm,
    expectedDm: dm.expectedDmFromRouting ?? simulatedDm,
    jobCity: dm.positionCity ?? city,
    jobState: dm.positionState ?? state,
    opportunities: input.opportunityPoints,
  });
  nearestMiles = proximity.nearestMiles;
  coverageTier = proximity.coverageTier;

  const proxEx = classifyP235ProximityExclusion(proximity);
  if (proxEx.reason) {
    const map: Record<string, P240BlockerCode> = {
      manual_review_40_60: "manual_review_40_60",
      blocked_over_60: "blocked_over_60",
      coverage_unknown: "coverage_unknown",
      no_active_work: "no_active_work",
    };
    blocker = map[proxEx.reason] ?? "coverage_unknown";
    blockerDetail = proxEx.detail;
    return finish();
  }
  steps.push("proximity_ok");
  steps.push("paperwork_needed");
  outcome = "would_reach_paperwork_needed";

  // Simulate Dropbox Sign + Paperwork Sent (no external calls).
  steps.push("dropbox_sign_simulated");
  steps.push("paperwork_sent_simulated");
  outcome = "would_send";
  return finish();
}

export function selectP240Cohorts(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  cutoff: P240CutoffResolution;
  priorSent: Set<string>;
  nowMs?: number;
}): {
  realNewIds: string[];
  proxyIds: string[];
  arrivalsLast14Days: number;
  estimatedDailyArrivalRate: number;
  projectedArrivalsNext24h: number;
  lookbackStartIso: string;
} {
  const nowMs = input.nowMs ?? Date.now();
  const lookbackStartMs = nowMs - P240_LOOKBACK_DAYS * 24 * 3600_000;
  const lookbackStartIso = new Date(lookbackStartMs).toISOString();

  const withDates = input.candidates
    .map((c) => {
      const applied = c.appliedDate || c.addedDate || "";
      return { id: c.candidateId, applied, ms: p240ParseMs(applied) ?? 0 };
    })
    .filter((r) => r.id && r.ms > 0)
    .sort((a, b) => b.ms - a.ms);

  const arrivalsLast14Days = withDates.filter(
    (r) => r.ms >= lookbackStartMs && r.ms <= nowMs,
  ).length;
  const estimatedDailyArrivalRate =
    Math.round((arrivalsLast14Days / P240_LOOKBACK_DAYS) * 10) / 10;
  const projectedArrivalsNext24h = Math.max(
    P240_MIN_PROXY_COHORT,
    Math.min(
      P240_MAX_PROXY_COHORT,
      Math.round(estimatedDailyArrivalRate * (P240_SIMULATION_HORIZON_HOURS / 24)),
    ),
  );

  const realNewIds = withDates
    .filter((r) => r.ms > input.cutoff.cutoffMs)
    .map((r) => r.id);

  // Proxy: newest N from last 14 days — walk as fresh new arrivals (labeled simulation).
  const proxyIds = withDates
    .filter((r) => r.ms >= lookbackStartMs && r.ms <= nowMs)
    .slice(0, projectedArrivalsNext24h)
    .map((r) => r.id);

  return {
    realNewIds,
    proxyIds,
    arrivalsLast14Days,
    estimatedDailyArrivalRate,
    projectedArrivalsNext24h,
    lookbackStartIso,
  };
}

export function buildP240RecruiterProposals(input: {
  workflows: Record<string, CandidateWorkflowRecord>;
  candidates: BreezyCandidate[];
  rosters: RecruiterRosters;
  candidateIds: string[];
}): Map<string, { recruiter: string | null; confidence: number | null }> {
  const idSet = new Set(input.candidateIds);
  const subsetCandidates = input.candidates.filter((c) => idSet.has(c.candidateId));
  const decisions = buildRecruiterAssignmentDecisions({
    workflows: input.workflows,
    candidates: subsetCandidates,
    rosters: input.rosters,
  });
  const map = new Map<string, { recruiter: string | null; confidence: number | null }>();
  for (const d of decisions) {
    const recruiter = String(d.recruiter ?? "").trim();
    map.set(d.candidateId, {
      recruiter: recruiter && !isUnassignedRecruiter(recruiter) ? recruiter : null,
      confidence: d.confidence ?? null,
    });
  }
  // Also map already-owned candidates
  for (const id of input.candidateIds) {
    if (map.has(id)) continue;
    const wf = input.workflows[id];
    if (wf && !isUnassignedRecruiter(wf.assignedRecruiter)) {
      map.set(id, {
        recruiter: String(wf.assignedRecruiter).trim(),
        confidence: 100,
      });
    } else {
      map.set(id, { recruiter: null, confidence: null });
    }
  }
  return map;
}

export function buildP240EmailOwners(
  candidates: BreezyCandidate[],
  ids: string[],
): Map<string, string> {
  const idSet = new Set(ids);
  const owners = new Map<string, string>();
  for (const c of candidates) {
    if (!idSet.has(c.candidateId)) continue;
    const email = p240NormalizeEmail(c.email);
    if (!email) continue;
    if (!owners.has(email)) owners.set(email, c.candidateId);
  }
  return owners;
}

export { isUnassignedDm, isUnassignedRecruiter };
