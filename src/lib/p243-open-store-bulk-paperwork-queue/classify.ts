import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import {
  hasAlreadySentPaperwork,
  loadP243IdempotencyStore,
  normalizeEmailFingerprint,
  type P243IdempotencyStoreFile,
} from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import {
  displayName,
  normalizePhone,
  projectMatchesPosition,
  type P243OsbpqResolvedRow,
} from "@/lib/p243-open-store-bulk-paperwork-queue/resolve-candidates";
import {
  P243_OSBPQ_KNOWN_SENT_IDS,
  P243_OSBPQ_MAX_MILES,
  P243_OSBPQ_PHASE,
  type P243OsbpqBlockReason,
  type P243OsbpqDistanceTier,
  type P243OsbpqPreviewSummary,
  type P243OsbpqQueueItem,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

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

export function distanceTier(miles: number | null): P243OsbpqDistanceTier {
  if (miles == null || !Number.isFinite(miles)) return "unknown";
  if (miles <= 20) return "tier1_0_20";
  if (miles <= 39) return "tier2_21_39";
  if (miles <= 60) return "tier3_40_60";
  return "over_60";
}

export function buildIdempotencyKey(candidateId: string, positionId: string | null): string {
  return `${P243_OSBPQ_PHASE}:${candidateId}:${positionId ?? "nopos"}`;
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

function tierRank(tier: P243OsbpqDistanceTier): number {
  switch (tier) {
    case "tier1_0_20":
      return 0;
    case "tier2_21_39":
      return 1;
    case "tier3_40_60":
      return 2;
    case "unknown":
      return 3;
    case "over_60":
      return 4;
    default:
      return 9;
  }
}

/**
 * Classify resolved sheet rows into eligible / blocked queue items, then
 * prioritize: Tier1 → Tier2 → Tier3 → oldest applicant → stores with no assigned.
 */
export async function classifyAndQueueP243(input: {
  resolved: P243OsbpqResolvedRow[];
  approveOver60Ids?: string[];
  safeCapacity: number | null;
}): Promise<{
  items: P243OsbpqQueueItem[];
  eligible: P243OsbpqQueueItem[];
  deferred: P243OsbpqQueueItem[];
  blocked: P243OsbpqQueueItem[];
  summary: P243OsbpqPreviewSummary;
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
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingSigByCandidate = new Map<string, string>();
  for (const rec of onboardingRecords) {
    const sig = String(rec.signatureRequestId ?? "").trim();
    if (!sig) continue;
    if (rec.status === "failed" || rec.status === "declined" || rec.status === "expired") continue;
    if (!onboardingSigByCandidate.has(rec.candidateId)) {
      onboardingSigByCandidate.set(rec.candidateId, sig);
    }
  }

  // Identity maps across resolved cohort
  const emailOwners = new Map<string, string>();
  const phoneOwners = new Map<string, string>();
  for (const row of input.resolved) {
    if (!row.candidate) continue;
    const id = row.candidate.candidateId;
    const email = emailOf(row.candidate, row.workflow);
    const phone = normalizePhone(row.candidate.phone);
    const emailFp = normalizeEmailFingerprint(email);
    if (emailFp && !emailOwners.has(emailFp)) emailOwners.set(emailFp, id);
    if (phone && !phoneOwners.has(phone)) phoneOwners.set(phone, id);
  }

  // Stores that already have a known-sent / signed candidate (from sheet cohort or prior)
  const storeAssigned = new Set<string>();
  for (const row of input.resolved) {
    if (!row.candidate) continue;
    const id = row.candidate.candidateId;
    const wf = row.workflow;
    const stage = stageOf(row.candidate, wf);
    const paperwork = paperworkOf(wf);
    const storeKey = `${row.sheet.storeNumber}|${row.sheet.storeCity},${row.sheet.storeState}`;
    const hasLivePacket =
      Boolean(String(wf?.signatureRequestId ?? "").trim()) ||
      paperwork === "sent" ||
      paperwork === "viewed" ||
      paperwork === "signed" ||
      Boolean(String(wf?.paperworkSentAt ?? "").trim());
    if (
      P243_OSBPQ_KNOWN_SENT_IDS.has(id) ||
      pilotSentIds.has(id) ||
      hasLivePacket ||
      stage === "Signed"
    ) {
      storeAssigned.add(storeKey);
    }
  }

  const items: P243OsbpqQueueItem[] = [];

  for (const row of input.resolved) {
    const sheet = row.sheet;
    const storeLabel =
      sheet.cityState ||
      (sheet.storeCity && sheet.storeState
        ? `${sheet.storeCity.toUpperCase()}, ${sheet.storeState}`
        : sheet.matchingOpenStore || "Unknown store");
    const storeKey = `${sheet.storeNumber}|${sheet.storeCity},${sheet.storeState}`;
    const blockReasons: P243OsbpqBlockReason[] = [];
    const details: string[] = [];

    if (row.ambiguous) {
      blockReasons.push("ambiguous_match");
      details.push(row.resolveDetail ?? "ambiguous");
    } else if (!row.candidate) {
      blockReasons.push("unresolved");
      details.push(row.resolveDetail ?? "unresolved");
    }

    const c = row.candidate;
    const wf = row.workflow;
    const id = c?.candidateId ?? `sheet-row-${sheet.rowIndex}`;
    const email = c ? emailOf(c, wf) : sheet.email;
    const phone = c?.phone ? String(c.phone) : sheet.phone;
    const workflowStage = c ? stageOf(c, wf) : sheet.sheetStage || "Unknown";
    const breezyStage = c ? String(c.stage ?? workflowStage) : sheet.sheetStage || "Unknown";
    const paperworkStatus = paperworkOf(wf);
    const signatureRequestId = String(wf?.signatureRequestId ?? "").trim() || null;
    const miles = row.milesToStore;
    const tier = distanceTier(miles);
    const appliedAt = c?.appliedDate || c?.addedDate || c?.createdDate || null;

    if (c) {
      const knownPrior =
        P243_OSBPQ_KNOWN_SENT_IDS.has(id) || pilotSentIds.has(id);
      const idempo = hasAlreadySentPaperwork(idempotency, id, email);
      const onboardingSig = onboardingSigByCandidate.get(id) ?? "";
      const hasLivePacket =
        Boolean(signatureRequestId) ||
        Boolean(onboardingSig) ||
        paperworkStatus === "sent" ||
        paperworkStatus === "viewed" ||
        paperworkStatus === "signed" ||
        Boolean(String(wf?.paperworkSentAt ?? "").trim());

      if (knownPrior || idempo.blocked || onboardingSig) {
        blockReasons.push("already_sent");
        details.push(
          onboardingSig
            ? `onboarding_active_sig=${onboardingSig.slice(0, 12)}`
            : knownPrior
              ? "known_canary_or_p242_sent"
              : (idempo.reason ?? "idempotency_already_sent"),
        );
      }

      if (paperworkStatus === "signed" || (workflowStage === "Signed" && hasLivePacket)) {
        blockReasons.push("already_signed");
        details.push("signed");
      }

      // Treat Paperwork Sent as already-sent only when Dropbox/packet evidence exists.
      // Stale stage-only rows (paperwork=not_sent, no signatureRequestId, no sentAt)
      // are allowed through so forceFreshReset can re-score and send.
      if (hasLivePacket || (workflowStage === "Paperwork Sent" && hasLivePacket)) {
        if (!blockReasons.includes("already_sent")) {
          blockReasons.push("already_sent");
          details.push(
            signatureRequestId
              ? `signatureRequestId=${signatureRequestId.slice(0, 12)}`
              : `paperwork=${paperworkStatus} stage=${workflowStage}`,
          );
        }
      } else if (workflowStage === "Paperwork Sent" && !hasLivePacket) {
        details.push("stale_paperwork_sent_without_packet");
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

      if (!email || !email.includes("@")) {
        blockReasons.push("invalid_email");
        details.push("invalid_or_missing_email");
      }

      // Active published position (only when published jobs were loaded)
      const pipeline = String(c.positionPipelineStatus ?? row.job?.status ?? "").toLowerCase();
      if (!c.positionId) {
        blockReasons.push("inactive_position");
        details.push("missing_position_id");
      } else if (row.jobsLoaded && row.job == null) {
        blockReasons.push("inactive_position");
        details.push(
          pipeline && pipeline !== "published"
            ? `pipeline=${pipeline}`
            : "position_not_in_published_jobs",
        );
      } else if (pipeline && ["closed", "archived", "draft"].includes(pipeline)) {
        blockReasons.push("inactive_position");
        details.push(`pipeline=${pipeline}`);
      }

      if (!projectMatchesPosition(sheet.project, c.positionName ?? sheet.position)) {
        blockReasons.push("wrong_project");
        details.push(`project=${sheet.project}`);
      }

      // Duplicate identity within cohort
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

      if (miles != null && miles > P243_OSBPQ_MAX_MILES && !approveOver60.has(id)) {
        blockReasons.push("over_60_miles");
        details.push(`miles=${miles}`);
      }

      if (
        !ACTIONABLE.has(workflowStage) &&
        !(workflowStage === "Paperwork Sent" && !hasLivePacket) &&
        blockReasons.length === 0
      ) {
        // "qualified" gate — Applied counts as intake-qualified for open-store push.
        // Stale Paperwork Sent without packet is treated as actionable for re-send.
        blockReasons.push("unsupported_stage");
        details.push(workflowStage);
      }
      if (workflowStage === "Not Qualified") {
        blockReasons.push("not_qualified");
        details.push("Not Qualified");
      }
    }

    const uniqueReasons = [...new Set(blockReasons)];
    const eligibility: P243OsbpqQueueItem["eligibility"] =
      uniqueReasons.length === 0 && c ? "eligible" : "blocked";

    items.push({
      candidateId: id,
      name: c ? displayName(c) : sheet.candidateName,
      email: email ?? null,
      phone: phone ?? null,
      positionId: c?.positionId ?? null,
      positionName: c?.positionName ?? sheet.position,
      storeLabel,
      storeNumber: sheet.storeNumber,
      project: sheet.project,
      storeCity: sheet.storeCity,
      storeState: sheet.storeState,
      homeCity: c?.city ?? sheet.candidateCity ?? null,
      homeState: c?.state ?? sheet.candidateState ?? null,
      breezyStage,
      workflowStage,
      paperworkStatus,
      signatureRequestId,
      actionType: wf?.actionType ?? null,
      assignedRecruiter: String(wf?.assignedRecruiter ?? "Unassigned"),
      assignedDM: String(wf?.assignedDM ?? "Unassigned"),
      matchMethod: row.matchMethod,
      matchConfidence: row.matchConfidence,
      milesToStore: miles,
      distanceTier: tier,
      appliedAt,
      eligibility,
      blockReasons: uniqueReasons,
      blockDetail: details.length ? details.join("; ") : null,
      alreadySentExclusion: uniqueReasons.includes("already_sent"),
      signedExclusion: uniqueReasons.includes("already_signed"),
      knownPriorSend:
        P243_OSBPQ_KNOWN_SENT_IDS.has(id) || pilotSentIds.has(id),
      storeHasAssignedCandidate: storeAssigned.has(storeKey),
      idempotencyKey: buildIdempotencyKey(id, c?.positionId ?? null),
      queuePriority: 0,
      sheetRowIndex: sheet.rowIndex,
    });
  }

  // Prioritize eligible, then dedupe by candidateId (one send per person)
  const eligibleRawAll = items.filter((i) => i.eligibility === "eligible");
  eligibleRawAll.sort((a, b) => {
    const t = tierRank(a.distanceTier) - tierRank(b.distanceTier);
    if (t !== 0) return t;
    // Oldest applicant first
    const aTime = a.appliedAt ? Date.parse(a.appliedAt) : Number.POSITIVE_INFINITY;
    const bTime = b.appliedAt ? Date.parse(b.appliedAt) : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    // Stores with no assigned candidate first
    if (a.storeHasAssignedCandidate !== b.storeHasAssignedCandidate) {
      return a.storeHasAssignedCandidate ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });

  const seenIds = new Set<string>();
  const eligibleRaw: P243OsbpqQueueItem[] = [];
  let droppedDupRows = 0;
  for (const item of eligibleRawAll) {
    if (seenIds.has(item.candidateId)) {
      droppedDupRows += 1;
      item.eligibility = "blocked";
      item.blockReasons = [...new Set([...item.blockReasons, "duplicate_identity" as const])];
      item.blockDetail = [item.blockDetail, `duplicate_sheet_row_of=${item.candidateId}`]
        .filter(Boolean)
        .join("; ");
      continue;
    }
    seenIds.add(item.candidateId);
    eligibleRaw.push(item);
  }

  eligibleRaw.forEach((item, idx) => {
    item.queuePriority = idx + 1;
  });

  const safeCap = input.safeCapacity;
  const wouldSendCount =
    safeCap == null ? 0 : Math.min(eligibleRaw.length, Math.max(0, safeCap));
  const eligible = eligibleRaw.slice(0, wouldSendCount);
  const deferred = eligibleRaw.slice(wouldSendCount).map((item) => ({
    ...item,
  }));
  const blocked = items.filter((i) => i.eligibility === "blocked");

  // Stamp deferred note into blockDetail only on deferred copies used for artifact
  for (const d of deferred) {
    d.blockDetail = [d.blockDetail, "eligible_deferred_api_capacity"]
      .filter(Boolean)
      .join("; ");
  }

  notes.push(
    `Classified ${items.length}: eligible=${eligibleRaw.length} blocked=${blocked.length} ` +
      `(dropped ${droppedDupRows} duplicate sheet row(s)); ` +
      `wouldSend=${eligible.length} deferred=${deferred.length} (safeCapacity=${safeCap ?? "null"}).`,
  );

  const summary = buildPreviewSummary({
    items,
    eligibleRaw,
    wouldSend: eligible.length,
    deferred: deferred.length,
    apiRemaining: null,
    safeCapacity: safeCap,
  });

  return { items, eligible, deferred, blocked, summary, notes };
}

export function buildPreviewSummary(input: {
  items: P243OsbpqQueueItem[];
  eligibleRaw: P243OsbpqQueueItem[];
  wouldSend: number;
  deferred: number;
  apiRemaining: number | null;
  safeCapacity: number | null;
}): P243OsbpqPreviewSummary {
  const { items } = input;
  const countReason = (reason: P243OsbpqBlockReason) =>
    items.filter((c) => c.blockReasons.includes(reason)).length;

  return {
    reviewed: items.length,
    eligible: input.eligibleRaw.length,
    alreadySent: countReason("already_sent"),
    alreadySigned: countReason("already_signed"),
    duplicates: items.filter(
      (c) =>
        c.blockReasons.includes("duplicate_identity") ||
        c.blockReasons.includes("identity_conflict"),
    ).length,
    invalidEmail: countReason("invalid_email"),
    blocked: items.filter((c) => c.eligibility === "blocked").length,
    ambiguous: countReason("ambiguous_match"),
    unresolved: countReason("unresolved"),
    apiRemaining: input.apiRemaining,
    safeCapacity: input.safeCapacity,
    wouldSend: input.wouldSend,
    deferred: input.deferred,
  };
}
