import type {
  AutonomousCandidateOutcome,
  AutonomousCandidateResult,
  AutonomousCycleReport,
} from "@/lib/p243-autonomous-end-to-end-pipeline/types";
import type {
  OpenStoreApplicantTrackingRow,
  OpenStoreApplicantTrackingStatus,
  OpenStoreMatch,
} from "@/lib/open-stores-paperwork-send/types";

const DEFAULT_PAPERWORK_TYPE = "onboarding_packet";

function storeContext(
  matches: OpenStoreMatch[],
  positionId: string | null,
): {
  storeCity: string | null;
  storeState: string | null;
  storeLabel: string | null;
  breezyPostName: string | null;
  positionName: string | null;
} {
  if (!positionId) {
    return {
      storeCity: null,
      storeState: null,
      storeLabel: null,
      breezyPostName: null,
      positionName: null,
    };
  }
  const match = matches.find((m) => m.positionId === positionId);
  if (!match) {
    return {
      storeCity: null,
      storeState: null,
      storeLabel: null,
      breezyPostName: null,
      positionName: null,
    };
  }
  const city = match.open.city || null;
  const state = match.open.state || null;
  return {
    storeCity: city,
    storeState: state,
    storeLabel: city && state ? `${city}, ${state}` : city || state,
    breezyPostName: match.breezyPost?.name ?? match.positionName ?? null,
    positionName: match.positionName ?? match.breezyPost?.name ?? null,
  };
}

export function mapOutcomeToStatus(candidate: AutonomousCandidateResult): {
  status: OpenStoreApplicantTrackingStatus;
  skipReason: string | null;
  qualifiedAdvanced: boolean;
  forcedAutoAdvance: boolean;
} {
  const forced = candidate.forcedAutoAdvance === true;

  if (candidate.paperworkExecuted) {
    return {
      status: "sent",
      skipReason: forced ? "forced_auto_advance" : null,
      qualifiedAdvanced: true,
      forcedAutoAdvance: forced,
    };
  }

  if (candidate.outcome === "auto_advance") {
    return {
      status: "planned",
      skipReason: forced ? "forced_auto_advance" : null,
      qualifiedAdvanced: true,
      forcedAutoAdvance: forced,
    };
  }

  if (candidate.outcome === "skipped_canary_cap") {
    return {
      status: "skipped",
      skipReason: candidate.skipReason ?? "canary_cap",
      qualifiedAdvanced: true,
      forcedAutoAdvance: forced,
    };
  }

  const skipReason = resolveSkipReason(candidate);
  return {
    status: "skipped",
    skipReason,
    qualifiedAdvanced: false,
    forcedAutoAdvance: forced,
  };
}

export function resolveSkipReason(candidate: AutonomousCandidateResult): string {
  if (candidate.skipReason) return candidate.skipReason;
  if (candidate.error) return candidate.error.slice(0, 160);

  switch (candidate.outcome as AutonomousCandidateOutcome) {
    case "skipped_already_sent":
      return "already_sent";
    case "skipped_idempotent":
      return "idempotent_fingerprint_match";
    case "skipped_state_machine":
      return "state_machine_blocked";
    case "skipped_canary_cap":
      return "canary_cap";
    case "skipped_filter":
      return "filtered";
    case "human_review":
      return candidate.p204Recommendation
        ? `human_review:${candidate.p204Recommendation}`
        : "human_review";
    case "auto_reject":
      return candidate.p204Recommendation
        ? `auto_reject:${candidate.p204Recommendation}`
        : "auto_reject";
    case "error":
      return "error";
    case "auto_advance":
      return "auto_advance_not_executed";
    default:
      return candidate.outcome;
  }
}

/**
 * Map P243 cycle candidates into open-stores applicant tracking rows,
 * enriched with store match context (city/state/post).
 */
export function buildApplicantTrackingList(input: {
  matches: OpenStoreMatch[];
  cycle: AutonomousCycleReport | null;
  emailByCandidateId?: Map<string, string>;
}): OpenStoreApplicantTrackingRow[] {
  if (!input.cycle) return [];

  const rows: OpenStoreApplicantTrackingRow[] = [];

  for (const candidate of input.cycle.candidates) {
    const store = storeContext(input.matches, candidate.positionId);
    const mapped = mapOutcomeToStatus(candidate);
    const emailFromCycle = candidate.email?.trim() || null;
    const emailFromLookup =
      input.emailByCandidateId?.get(candidate.candidateId)?.trim() || null;

    rows.push({
      candidateId: candidate.candidateId,
      redactedCandidateId: candidate.redactedCandidateId,
      name: candidate.name,
      email: emailFromCycle || emailFromLookup,
      positionId: candidate.positionId,
      positionName: store.positionName,
      storeCity: store.storeCity,
      storeState: store.storeState,
      storeLabel: store.storeLabel,
      breezyPostName: store.breezyPostName,
      paperworkType: DEFAULT_PAPERWORK_TYPE,
      status: mapped.status,
      skipReason: mapped.skipReason,
      p204Outcome: candidate.outcome,
      p204Recommendation: candidate.p204Recommendation,
      confidence: candidate.confidence,
      paperworkTasksPlanned: candidate.paperworkTasksPlanned,
      qualifiedAdvanced: mapped.qualifiedAdvanced,
      forcedAutoAdvance: mapped.forcedAutoAdvance,
      appliedAt: candidate.appliedAt,
    });
  }

  // Planned/sent first, then skipped; within group by store then name
  const rank = (s: OpenStoreApplicantTrackingStatus) =>
    s === "sent" ? 0 : s === "planned" ? 1 : 2;

  return rows.sort((a, b) => {
    const rd = rank(a.status) - rank(b.status);
    if (rd !== 0) return rd;
    const storeCmp = (a.storeLabel ?? "").localeCompare(b.storeLabel ?? "");
    if (storeCmp !== 0) return storeCmp;
    return a.name.localeCompare(b.name);
  });
}

export function tallyApplicantTracking(rows: OpenStoreApplicantTrackingRow[]): {
  planned: number;
  sent: number;
  skipped: number;
  qualifiedAdvanced: number;
  forcedAutoAdvance: number;
} {
  let planned = 0;
  let sent = 0;
  let skipped = 0;
  let qualifiedAdvanced = 0;
  let forcedAutoAdvance = 0;
  for (const row of rows) {
    if (row.status === "planned") planned += 1;
    else if (row.status === "sent") sent += 1;
    else skipped += 1;
    if (row.qualifiedAdvanced) qualifiedAdvanced += 1;
    if (row.forcedAutoAdvance) forcedAutoAdvance += 1;
  }
  return { planned, sent, skipped, qualifiedAdvanced, forcedAutoAdvance };
}
