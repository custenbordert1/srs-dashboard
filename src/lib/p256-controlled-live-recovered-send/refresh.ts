import { fetchBreezyJobs, type BreezyCandidate } from "@/lib/breezy-api";
import {
  listIngestedCandidates,
  mergeIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { fetchBreezyCandidateByPosition } from "@/lib/p255-recover-eligible-candidates/sources";
import { loadP253OpportunityPoints } from "@/lib/p253-controlled-live-paperwork-send/refresh";
import type { P235OppPoint } from "@/lib/p235-controlled-newest-five-send/eligibility";
import type {
  P256AuthorizedTarget,
  P256RefreshSummary,
} from "@/lib/p256-controlled-live-recovered-send/types";

/**
 * Prefer live Breezy fields, but never wipe P255-recovered city/state/phone/zip
 * when Breezy returns blanks (list payloads often omit address).
 */
function preserveRecoveredIdentity(
  live: BreezyCandidate,
  existing: BreezyCandidate | null | undefined,
): BreezyCandidate {
  const keep = (incoming: string | undefined, prior: string | undefined): string => {
    const a = String(incoming ?? "").trim();
    const b = String(prior ?? "").trim();
    return a || b || "";
  };
  return {
    ...live,
    phone: keep(live.phone, existing?.phone),
    city: keep(live.city, existing?.city),
    state: keep(live.state, existing?.state),
    zipCode: keep(live.zipCode, existing?.zipCode),
    email: keep(live.email, existing?.email),
    firstName: keep(live.firstName, existing?.firstName) || live.firstName,
    lastName: keep(live.lastName, existing?.lastName) || live.lastName,
    positionId: keep(live.positionId, existing?.positionId) || live.positionId,
  };
}

/**
 * Refresh ONLY the authorized recovered candidates from Breezy immediately
 * before eligibility + send. Never scans other positions / bulk ingestion.
 */
export async function refreshP256AuthorizedCandidates(input: {
  targets: P256AuthorizedTarget[];
  allowNetworkGeocode?: boolean;
}): Promise<{
  summary: P256RefreshSummary;
  candidatesById: Map<string, BreezyCandidate>;
  workflows: Awaited<ReturnType<typeof getCandidateWorkflowState>>;
  onboardingByCandidateId: Map<
    string,
    import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord
  >;
  opportunityPoints: P235OppPoint[];
  emailByCandidateId: Map<string, string>;
  refreshedIds: Set<string>;
}> {
  const notes: string[] = [];
  const refreshedIds = new Set<string>();
  let breezyHits = 0;
  let breezyMisses = 0;
  let ingestionWrites = 0;

  let store = await readIngestionStore();
  const liveHits: BreezyCandidate[] = [];

  for (const target of input.targets) {
    const existing = store.candidates[target.candidateId] ?? null;
    // Seed P255 recovered location onto durable record before Breezy merge when blank.
    const seededExisting: BreezyCandidate | null = existing
      ? {
          ...existing,
          city:
            String(existing.city ?? "").trim() ||
            target.city ||
            String(existing.city ?? ""),
          state:
            String(existing.state ?? "").trim() ||
            target.state ||
            String(existing.state ?? ""),
        }
      : target.city && target.state
        ? ({
            candidateId: target.candidateId,
            firstName: target.name.split(/\s+/)[0] ?? target.name,
            lastName: target.name.split(/\s+/).slice(1).join(" "),
            email: target.email,
            phone: "",
            city: target.city,
            state: target.state,
            zipCode: "",
            positionId: target.positionId ?? "",
            positionName: "",
            stage: "",
            appliedDate: null,
            updatedDate: null,
            tags: [],
            sourced: false,
          } as unknown as BreezyCandidate)
        : null;

    const positionId =
      String(target.positionId ?? "").trim() ||
      String(seededExisting?.positionId ?? "").trim() ||
      null;

    const live = await fetchBreezyCandidateByPosition({
      candidateId: target.candidateId,
      positionId,
    });

    if (live) {
      breezyHits += 1;
      refreshedIds.add(target.candidateId);
      const preserved = preserveRecoveredIdentity(live, seededExisting);
      if (
        (!String(live.city ?? "").trim() || !String(live.state ?? "").trim()) &&
        String(preserved.city ?? "").trim() &&
        String(preserved.state ?? "").trim()
      ) {
        notes.push(
          `Preserved durable location for ${target.candidateId}: ${preserved.city}, ${preserved.state} (Breezy list omitted address)`,
        );
      }
      liveHits.push(preserved);
      notes.push(
        `Breezy refresh OK: ${target.name} (${target.candidateId}) via position ${positionId ?? "unknown"}`,
      );
    } else {
      breezyMisses += 1;
      notes.push(
        `Breezy refresh MISS: ${target.name} (${target.candidateId}) position=${positionId ?? "none"} — using durable ingestion`,
      );
      if (seededExisting && (!existing || !String(existing.city ?? "").trim())) {
        liveHits.push(seededExisting);
        notes.push(
          `Seeded P255 location for ${target.candidateId}: ${seededExisting.city}, ${seededExisting.state}`,
        );
      }
    }
  }

  if (liveHits.length > 0) {
    const merged = mergeIngestedCandidates(store, liveHits);
    store = merged.store;
    await writeIngestionStore(store);
    ingestionWrites = liveHits.length;
    notes.push(`Ingestion durable writes=${ingestionWrites}`);
  }

  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  notes.push(
    jobsResult.ok
      ? `Published jobs loaded=${jobs.length}`
      : `Published jobs failed: ${jobsResult.error ?? "unknown"}`,
  );

  const [workflows, onboardingRecords, opportunityPoints] = await Promise.all([
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
    loadP253OpportunityPoints({
      allowNetwork: input.allowNetworkGeocode !== false,
      jobs,
    }),
  ]);
  notes.push(`Opportunity geocode points=${opportunityPoints.length}`);

  const candidatesById = new Map<string, BreezyCandidate>();
  const emailByCandidateId = new Map<string, string>();
  const ingested = listIngestedCandidates(store);

  for (const target of input.targets) {
    const candidate =
      ingested.find((c) => c.candidateId === target.candidateId) ??
      liveHits.find((c) => c.candidateId === target.candidateId) ??
      null;
    if (candidate) {
      candidatesById.set(target.candidateId, candidate);
      const email = String(candidate.email ?? target.email ?? "").trim();
      if (email) emailByCandidateId.set(target.candidateId, email);
    } else if (target.email) {
      // Minimal stub so eligibility can still surface missing fields clearly.
      const stub = {
        candidateId: target.candidateId,
        firstName: target.name.split(/\s+/)[0] ?? target.name,
        lastName: target.name.split(/\s+/).slice(1).join(" "),
        email: target.email,
        phone: "",
        city: "",
        state: "",
        zipCode: "",
        positionId: target.positionId ?? "",
        positionName: "",
        stage: "",
        appliedDate: null,
        updatedDate: null,
        tags: [],
        sourced: false,
      } as unknown as BreezyCandidate;
      candidatesById.set(target.candidateId, stub);
      emailByCandidateId.set(target.candidateId, target.email);
      notes.push(`Durable/live candidate missing for ${target.candidateId} — stubbed email only`);
    }
  }

  return {
    summary: {
      targets: input.targets.length,
      breezyHits,
      breezyMisses,
      ingestionWrites,
      notes,
    },
    candidatesById,
    workflows,
    onboardingByCandidateId: new Map(onboardingRecords.map((r) => [r.candidateId, r])),
    opportunityPoints,
    emailByCandidateId,
    refreshedIds,
  };
}
