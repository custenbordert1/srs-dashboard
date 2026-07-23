import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  mergeIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { mergeCandidateRecord } from "@/lib/candidate-ingestion/merge-candidate-record";
import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import { hasUsablePhone, isUnassignedRecruiter } from "@/lib/p228-production-readiness/eligibility";
import { resolveP235AuthoritativeDm } from "@/lib/p235-controlled-newest-five-send/dm";
import type { P254CandidateForensic } from "@/lib/p254-eligibility-forensics/types";
import {
  emptyBreezyCandidateShell,
  loadLocalAuthoritativeMaps,
  resolveAuthoritativeIdentity,
  type P255LocalIdentity,
} from "@/lib/p255-recover-eligible-candidates/sources";
import {
  P255_BY_USER,
  P255_PHASE,
  P255_TAYLOR,
  type P255CandidateRecovery,
  type P255FieldAudit,
} from "@/lib/p255-recover-eligible-candidates/types";

function needsTaylorRecruiter(value: string): boolean {
  return isUnassignedRecruiter(value) || /^recruiting team$/i.test(value.trim());
}

function fillMissingString(before: string, proposed: string): string | null {
  if (String(before ?? "").trim()) return null;
  const next = String(proposed ?? "").trim();
  return next || null;
}

function fillMissingPhone(before: string, proposed: string): string | null {
  if (hasUsablePhone(before)) return null;
  return hasUsablePhone(proposed) ? String(proposed).trim() : null;
}

/**
 * Repair only empty/invalid recoverable fields. Never overwrite valid data.
 */
export async function repairP255Candidate(input: {
  forensic: P254CandidateForensic;
  jobsById: Map<string, BreezyJob>;
  maps: ReturnType<typeof loadLocalAuthoritativeMaps>;
  persist: boolean;
}): Promise<{
  recovery: Omit<
    P255CandidateRecovery,
    | "blockersAfter"
    | "nowEligible"
    | "stillBlocked"
    | "stillBlockedReasons"
    | "eligibilityResultAfter"
    | "nearestMilesAfter"
    | "coverageKnownAfter"
  >;
  workflowWrites: number;
  ingestionWrites: number;
}> {
  const forensic = input.forensic;
  const notes: string[] = [];
  const fieldAudits: P255FieldAudit[] = [];
  let workflowWrites = 0;
  let ingestionWrites = 0;

  const store = await readIngestionStore();
  const workflows = await getCandidateWorkflowState();
  const existingIngestion = store.candidates[forensic.candidateId] ?? null;
  const existingWorkflow = workflows[forensic.candidateId] ?? null;

  const resolved = await resolveAuthoritativeIdentity({
    candidateId: forensic.candidateId,
    forensicName: forensic.name,
    forensicLocation: forensic.location,
    ingestion: existingIngestion,
    maps: input.maps,
  });
  notes.push(...resolved.notes);
  const identity = resolved.identity;

  const baseCandidate: BreezyCandidate =
    resolved.breezyLive ??
    existingIngestion ??
    emptyBreezyCandidateShell(identity);

  // Durable "before" values for audit (never claim a write fixed something already good).
  const durablePhoneBefore = String(existingIngestion?.phone ?? "");
  const durableCityBefore = String(existingIngestion?.city ?? "");
  const durableStateBefore = String(existingIngestion?.state ?? "");
  const durableFirstBefore = String(existingIngestion?.firstName ?? "");
  const durableLastBefore = String(existingIngestion?.lastName ?? "");
  const durableEmailBefore = String(existingIngestion?.email ?? "");
  const durablePositionIdBefore = String(existingIngestion?.positionId ?? "");
  const durablePositionNameBefore = String(existingIngestion?.positionName ?? "");

  // Build patched ingestion candidate — only fill empties.
  let nextCandidate: BreezyCandidate = { ...baseCandidate };
  const ingestionPatches: Array<{
    field: P255FieldAudit["field"];
    before: string;
    after: string;
    source: P255FieldAudit["source"];
    reason: string;
  }> = [];

  const phoneAfter = fillMissingPhone(durablePhoneBefore, identity.phone);
  if (phoneAfter) {
    ingestionPatches.push({
      field: "phone",
      before: durablePhoneBefore,
      after: phoneAfter,
      source: identity.phoneSource,
      reason: "Backfill usable phone from authoritative source",
    });
    nextCandidate = { ...nextCandidate, phone: phoneAfter };
  } else if (hasUsablePhone(nextCandidate.phone) === false && hasUsablePhone(identity.phone)) {
    nextCandidate = { ...nextCandidate, phone: identity.phone };
  }

  const cityAfter = fillMissingString(durableCityBefore, identity.city);
  if (cityAfter) {
    ingestionPatches.push({
      field: "city",
      before: durableCityBefore,
      after: cityAfter,
      source: identity.locationSource,
      reason: "Backfill home/job city for coverage geocode",
    });
    nextCandidate = { ...nextCandidate, city: cityAfter };
  } else if (!String(nextCandidate.city ?? "").trim() && identity.city) {
    nextCandidate = { ...nextCandidate, city: identity.city };
  }

  const stateAfter = fillMissingString(durableStateBefore, identity.state);
  if (stateAfter) {
    ingestionPatches.push({
      field: "state",
      before: durableStateBefore,
      after: stateAfter,
      source: identity.locationSource,
      reason: "Backfill home/job state for coverage geocode",
    });
    nextCandidate = { ...nextCandidate, state: stateAfter };
  } else if (!String(nextCandidate.state ?? "").trim() && identity.state) {
    nextCandidate = { ...nextCandidate, state: identity.state };
  }

  const firstAfter = fillMissingString(durableFirstBefore, identity.firstName);
  if (firstAfter) {
    ingestionPatches.push({
      field: "firstName",
      before: durableFirstBefore,
      after: firstAfter,
      source: identity.identitySource,
      reason: "Restore identity first name",
    });
    nextCandidate = { ...nextCandidate, firstName: firstAfter };
  }

  const lastAfter = fillMissingString(durableLastBefore, identity.lastName);
  if (lastAfter) {
    ingestionPatches.push({
      field: "lastName",
      before: durableLastBefore,
      after: lastAfter,
      source: identity.identitySource,
      reason: "Restore identity last name",
    });
    nextCandidate = { ...nextCandidate, lastName: lastAfter };
  }

  const emailAfter = fillMissingString(durableEmailBefore, identity.email);
  if (emailAfter) {
    ingestionPatches.push({
      field: "email",
      before: durableEmailBefore,
      after: emailAfter,
      source: identity.identitySource,
      reason: "Restore contact email",
    });
    nextCandidate = { ...nextCandidate, email: emailAfter };
  }

  const positionIdAfter = fillMissingString(durablePositionIdBefore, identity.positionId);
  if (positionIdAfter) {
    ingestionPatches.push({
      field: "positionId",
      before: durablePositionIdBefore,
      after: positionIdAfter,
      source: identity.identitySource,
      reason: "Restore Breezy position id",
    });
    nextCandidate = { ...nextCandidate, positionId: positionIdAfter };
  }

  const positionNameAfter = fillMissingString(
    durablePositionNameBefore,
    identity.positionName,
  );
  if (positionNameAfter) {
    ingestionPatches.push({
      field: "positionName",
      before: durablePositionNameBefore,
      after: positionNameAfter,
      source: identity.identitySource,
      reason: "Restore Breezy position name",
    });
    nextCandidate = { ...nextCandidate, positionName: positionNameAfter };
  }

  const needsIngestionWrite = !existingIngestion || ingestionPatches.length > 0;

  if (needsIngestionWrite) {
    const merged = mergeCandidateRecord(existingIngestion ?? undefined, nextCandidate);
    // Re-apply fill-only patches after merge so empty Breezy city/state cannot wipe recovery location.
    const guarded: BreezyCandidate = {
      ...merged,
      phone: hasUsablePhone(merged.phone)
        ? merged.phone
        : hasUsablePhone(nextCandidate.phone)
          ? nextCandidate.phone
          : merged.phone,
      city: String(merged.city ?? "").trim() || String(nextCandidate.city ?? "").trim(),
      state:
        String(merged.state ?? "").trim().toUpperCase() ||
        String(nextCandidate.state ?? "").trim().toUpperCase(),
      email: String(merged.email ?? "").trim() || String(nextCandidate.email ?? "").trim(),
      firstName:
        String(merged.firstName ?? "").trim() || String(nextCandidate.firstName ?? "").trim(),
      lastName:
        String(merged.lastName ?? "").trim() || String(nextCandidate.lastName ?? "").trim(),
      positionId:
        String(merged.positionId ?? "").trim() || String(nextCandidate.positionId ?? "").trim(),
      positionName:
        String(merged.positionName ?? "").trim() ||
        String(nextCandidate.positionName ?? "").trim(),
    };

    if (input.persist) {
      const current = await readIngestionStore();
      const { store: updated } = mergeIngestedCandidates(current, [guarded]);
      // Force guarded fills after mergeIngestedCandidates for empty→filled city/phone.
      updated.candidates[forensic.candidateId] = mergeCandidateRecord(
        updated.candidates[forensic.candidateId],
        guarded,
      );
      // Ensure empty breezy location does not clear recovered city/state.
      const written = updated.candidates[forensic.candidateId]!;
      updated.candidates[forensic.candidateId] = {
        ...written,
        phone: hasUsablePhone(written.phone) ? written.phone : guarded.phone,
        city: String(written.city ?? "").trim() || guarded.city,
        state: String(written.state ?? "").trim().toUpperCase() || guarded.state,
      };
      await writeIngestionStore(updated);
      ingestionWrites += 1;
    }

    for (const patch of ingestionPatches) {
      fieldAudits.push({
        ...patch,
        applied: input.persist,
      });
    }
    if (!existingIngestion) {
      notes.push(
        input.persist
          ? "Created missing durable ingestion record"
          : "Would create missing durable ingestion record",
      );
    } else if (ingestionPatches.length === 0 && resolved.breezyLive) {
      notes.push("Refreshed ingestion from Breezy live (no empty-field patches needed)");
    }
  }

  // Ownership repairs (workflow only) — Taylor + DM from position location when missing.
  const beforeRecruiter = String(
    existingWorkflow?.assignedRecruiter ?? forensic.recruiter ?? "Unassigned",
  );
  const beforeDm = String(existingWorkflow?.assignedDM ?? forensic.districtManager ?? "Unassigned");

  // Only assign Taylor when recruiter is empty/Unassigned (or explicitly blocked).
  // Do not steal an already-valid named recruiter; Recruiting Team is left alone
  // unless P254 marked missing_recruiter (placeholder treated as invalid then).
  const recruiterInvalid =
    isUnassignedRecruiter(beforeRecruiter) ||
    (forensic.allBlockers.includes("missing_recruiter") &&
      needsTaylorRecruiter(beforeRecruiter));
  const nextRecruiter = recruiterInvalid ? P255_TAYLOR : beforeRecruiter;

  let nextDm = beforeDm;
  let dmSource: P255FieldAudit["source"] = "workflow_db";
  let dmReason = "DM already assigned — left unchanged";

  if (forensic.allBlockers.includes("missing_dm") || isUnassignedDm(beforeDm)) {
    const positionId =
      String(nextCandidate.positionId || identity.positionId || "").trim() || null;
    const job = positionId ? input.jobsById.get(positionId) ?? null : null;
    const dmResolution = resolveP235AuthoritativeDm({
      currentAssignedDM: beforeDm,
      positionId,
      positionName: nextCandidate.positionName || identity.positionName || null,
      homeCity: String(nextCandidate.city || identity.city || "").trim(),
      homeState: String(nextCandidate.state || identity.state || "").trim(),
      job,
    });
    if (dmResolution.ok && dmResolution.proposedAssignedDM) {
      nextDm = dmResolution.proposedAssignedDM;
      dmSource = "p216_position_location_territory_routing";
      dmReason = `Authoritative DM from position location (${dmResolution.routingState ?? "n/a"})`;
      notes.push(
        `DM resolved via P216: ${nextDm} (state=${dmResolution.routingState}, city=${dmResolution.positionCity})`,
      );
    } else {
      notes.push(
        `DM unresolved: ${dmResolution.reason}${job ? "" : " (position job not in published list)"}`,
      );
    }
  }

  let ownershipChanged = false;
  const ownershipInput: Parameters<typeof upsertCandidateWorkflow>[0] = {
    candidateId: forensic.candidateId,
    audit: {
      action: "p255_recover_eligible_candidates",
      byUserId: P255_BY_USER,
      metadata: {
        phase: P255_PHASE,
        previousRecruiter: beforeRecruiter,
        previousDm: beforeDm,
        blockersBefore: forensic.allBlockers.join(","),
      },
    },
  };

  if (nextRecruiter !== beforeRecruiter) {
    ownershipChanged = true;
    ownershipInput.assignedRecruiter = nextRecruiter;
    ownershipInput.recruiterAssignmentSource = "auto";
    ownershipInput.recruiterAssignmentReason = `${P255_PHASE}: recover missing recruiter (P242 pattern)`;
    fieldAudits.push({
      field: "assignedRecruiter",
      before: beforeRecruiter,
      after: nextRecruiter,
      source: "workflow_db",
      applied: input.persist,
      reason: "Assign Taylor when recruiter empty/Unassigned (P234/P242 pattern)",
    });
  }

  if (nextDm !== beforeDm && !isUnassignedDm(nextDm)) {
    ownershipChanged = true;
    ownershipInput.assignedDM = nextDm;
    fieldAudits.push({
      field: "assignedDM",
      before: beforeDm,
      after: nextDm,
      source: dmSource,
      applied: input.persist,
      reason: dmReason,
    });
  }

  if (ownershipChanged && input.persist) {
    await upsertCandidateWorkflow(ownershipInput);
    workflowWrites += 1;
  } else if (ownershipChanged) {
    notes.push("Ownership changes computed (dry-run — not persisted)");
  }

  const repaired = fieldAudits.some((a) => a.applied) || (!input.persist && fieldAudits.length > 0);

  return {
    workflowWrites,
    ingestionWrites,
    recovery: {
      candidateId: forensic.candidateId,
      name: identity.displayName || forensic.name,
      email: identity.email,
      blockersBefore: [...forensic.allBlockers],
      repaired,
      eligibilityResultBefore: forensic.eligibilityResult,
      fieldAudits,
      notes,
    },
  };
}

export function summarizeIdentityForLog(identity: P255LocalIdentity): string {
  return `${identity.displayName} phone=${identity.phone || "—"} loc=${identity.city || "—"}, ${identity.state || "—"}`;
}
