import { fetchBreezyJobs, type BreezyJob } from "@/lib/breezy-api";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  getCandidateWorkflowBundle,
  getCandidateWorkflowState,
} from "@/lib/candidate-workflow-store";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import { geocodeKey, getCachedGeocode } from "@/lib/geocoding/geocode-cache";
import { resolveCoordinates } from "@/lib/geocoding/geocoder";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { reconcileP185Envelopes } from "@/lib/p185-production-paperwork-automation-runner/reconciliation";
import type { P253RefreshSummary } from "@/lib/p253-controlled-live-paperwork-send/types";
import type { P235OppPoint } from "@/lib/p235-controlled-newest-five-send/eligibility";

async function trustedPoint(loc: {
  city: string;
  state: string;
  zip?: string;
  allowNetwork: boolean;
}): Promise<{ lat: number; lng: number } | null> {
  const city = loc.city.trim();
  const state = loc.state.trim().toUpperCase();
  if (!city || !state) return null;
  const key = geocodeKey({ city, state, zip: loc.zip });
  const keyNoZip = geocodeKey({ city, state });
  const cached =
    (await getCachedGeocode(key)) ??
    (keyNoZip !== key ? await getCachedGeocode(keyNoZip) : null);
  if (cached?.source === "nominatim") {
    return { lat: cached.lat, lng: cached.lng };
  }
  if (!loc.allowNetwork) {
    return cached ? { lat: cached.lat, lng: cached.lng } : null;
  }
  const resolved = await resolveCoordinates(
    { city, state, zip: loc.zip },
    { allowNetwork: true },
  );
  if (!resolved || resolved.source !== "nominatim") {
    return cached ? { lat: cached.lat, lng: cached.lng } : null;
  }
  return { lat: resolved.lat, lng: resolved.lng };
}

/**
 * Best-effort MEL opportunity extraction (p209 module not present in this tree).
 * Prefers rows that look open/unassigned; otherwise keeps geographic rows.
 */
function extractMelOpportunityLocations(
  rows: Array<Record<string, string>>,
): Array<{ city: string; state: string; zip?: string }> {
  const out: Array<{ city: string; state: string; zip?: string }> = [];
  for (const row of rows) {
    const status = String(
      row.Status ?? row.status ?? row["Project Status"] ?? row.Assignment ?? "",
    ).toLowerCase();
    const assigned = String(
      row["Assigned Rep"] ?? row.Rep ?? row["Rep Name"] ?? row.Assignee ?? "",
    ).trim();
    const looksClosed = /\b(closed|complete|cancelled|canceled|inactive)\b/.test(status);
    const looksAssigned =
      Boolean(assigned) && !/^unassigned$/i.test(assigned) && assigned.toLowerCase() !== "n/a";
    if (looksClosed) continue;
    if (looksAssigned && !/\bunassigned\b|\bopen\b|\bneed/.test(status)) continue;

    const city = String(row.City ?? row.city ?? row["Store City"] ?? "").trim();
    const state = String(row.State ?? row.state ?? row["Store State"] ?? "")
      .trim()
      .toUpperCase();
    const zip = String(row.Zip ?? row.zip ?? row["Zip Code"] ?? row.ZIP ?? "").trim();
    if (!city || !state) continue;
    out.push({ city, state, zip: zip || undefined });
  }
  return out;
}

function jobLocations(jobs: BreezyJob[]): Array<{ city: string; state: string; zip?: string }> {
  return jobs
    .map((job) => ({
      city: String(job.city ?? "").trim(),
      state: String(job.state ?? "").trim().toUpperCase(),
      zip: String(job.zip ?? "").trim() || undefined,
    }))
    .filter((loc) => Boolean(loc.city && loc.state));
}

export async function loadP253OpportunityPoints(input?: {
  allowNetwork?: boolean;
  jobs?: BreezyJob[];
}): Promise<P235OppPoint[]> {
  const allowNetwork = input?.allowNetwork === true;
  const locations: Array<{ city: string; state: string; zip?: string }> = [];

  if (input?.jobs?.length) {
    locations.push(...jobLocations(input.jobs));
  }

  try {
    const sheet = await fetchMelProjectsSheet();
    if (sheet.ok && Array.isArray(sheet.rows)) {
      locations.push(
        ...extractMelOpportunityLocations(sheet.rows as Array<Record<string, string>>),
      );
    }
  } catch {
    /* MEL optional */
  }

  const unique = new Map<string, { city: string; state: string; zip: string }>();
  for (const loc of locations) {
    const city = String(loc.city ?? "").trim();
    const state = String(loc.state ?? "").trim().toUpperCase();
    const zip = String(loc.zip ?? "").trim();
    if (!city || !state) continue;
    const key = `${city}|${state}|${zip}`.toLowerCase();
    if (!unique.has(key)) unique.set(key, { city, state, zip });
  }

  const points: P235OppPoint[] = [];
  for (const loc of unique.values()) {
    const p = await trustedPoint({ ...loc, allowNetwork });
    if (p) points.push({ city: loc.city, state: loc.state, lat: p.lat, lng: p.lng });
  }
  return points;
}

export async function resolveP253HomePoint(input: {
  city: string;
  state: string;
  zip?: string;
  allowNetwork?: boolean;
}): Promise<{ lat: number; lng: number } | null> {
  return trustedPoint({
    city: input.city,
    state: input.state,
    zip: input.zip,
    allowNetwork: input.allowNetwork === true,
  });
}

/**
 * Refresh ingestion + Dropbox status. Recruiter/DM are read from durable workflow
 * (no ownership writes — P253 must not modify assignments).
 */
export async function refreshP253Data(input?: {
  allowNetworkGeocode?: boolean;
}): Promise<{
  summary: P253RefreshSummary;
  store: Awaited<ReturnType<typeof readIngestionStore>>;
  workflows: Awaited<ReturnType<typeof getCandidateWorkflowState>>;
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingByCandidateId: Map<
    string,
    import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord
  >;
  opportunityPoints: P235OppPoint[];
}> {
  const notes: string[] = [];
  const byUserId = "p253-controlled-live-paperwork-send";

  // Prefer Breezy scan without automation pipeline — pipeline MTD filter can throw
  // on candidates missing appliedDate (parseCandidateAppliedDate).
  let ingestion: Awaited<ReturnType<typeof runCandidateIngestionSync>> | null = null;
  try {
    ingestion = await runCandidateIngestionSync({
      byUserId,
      runPipeline: false,
      enrichQuestionnaires: false,
      maxRuntimeMs: 90_000,
      maxPositionsPerChunk: 25,
    });
    notes.push(
      ingestion.ok
        ? `Ingestion scan ok: new=${ingestion.newCandidates} total=${ingestion.totalCandidates} scanned=${ingestion.positionsScannedThisRun}`
        : `Ingestion scan incomplete: ${ingestion.error ?? "unknown"}`,
    );
  } catch (error) {
    notes.push(
      `Ingestion scan threw (${error instanceof Error ? error.message : String(error)}) — continuing from durable store.`,
    );
  }

  let dropboxReconciled = 0;
  try {
    const reconciliation = await reconcileP185Envelopes({
      nowMs: Date.now(),
      limit: 250,
      deps: { getSignatureRequest },
    });
    dropboxReconciled = reconciliation.transitions?.length ?? 0;
    notes.push(`Dropbox reconcile transitions=${dropboxReconciled}`);
  } catch (error) {
    notes.push(
      `Dropbox reconcile soft-fail: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const [store, workflows, jobsResult, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  await getCandidateWorkflowBundle();

  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  notes.push(
    jobsResult.ok
      ? `Published jobs loaded=${jobs.length}`
      : `Published jobs failed: ${jobsResult.error ?? "unknown"}`,
  );

  const opportunityPoints = await loadP253OpportunityPoints({
    allowNetwork: input?.allowNetworkGeocode === true,
    jobs,
  });
  notes.push(`Opportunity geocode points=${opportunityPoints.length}`);
  notes.push(`Ingested candidates=${listIngestedCandidates(store).length}`);
  notes.push("Recruiter/DM: read-only from durable workflow (no ownership writes).");

  return {
    summary: {
      ingestionOk: ingestion?.ok === true,
      ingestionDetail: ingestion
        ? ingestion.ok
          ? `new=${ingestion.newCandidates} total=${ingestion.totalCandidates}`
          : (ingestion.error ?? "ingestion failed")
        : "durable store only",
      newCandidates: ingestion?.newCandidates ?? 0,
      totalCandidates:
        ingestion?.totalCandidates ?? listIngestedCandidates(store).length,
      workflowsTouched: Object.keys(workflows).length,
      recruiterAssignmentsApplied: 0,
      dmAssignmentsApplied: 0,
      dropboxReconciled,
      notes,
    },
    store,
    workflows,
    jobsByPositionId,
    onboardingByCandidateId: new Map(onboardingRecords.map((r) => [r.candidateId, r])),
    opportunityPoints,
  };
}
