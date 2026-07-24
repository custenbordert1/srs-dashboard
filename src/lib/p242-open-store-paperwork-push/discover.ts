import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { estimateGeoPoint, haversineMiles } from "@/lib/mel-matching/distance-utils";
import {
  normalizeCity,
  normalizeText,
} from "@/lib/open-stores-paperwork-send/normalize";
import {
  attachLivePositionIds,
  matchOpensToBreezyPosts,
  uniqueMatchedPositionIds,
} from "@/lib/open-stores-paperwork-send/match-opens-to-breezy";
import {
  loadTrendsWorkbook,
  opensWithApplicants,
} from "@/lib/open-stores-paperwork-send/parse-workbook";
import type { OpenStoreMatch } from "@/lib/open-stores-paperwork-send/types";
import { normalizeEmailFingerprint } from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import { dedupeBreezyCandidates } from "@/lib/p243-autonomous-end-to-end-pipeline/pull";
import type { P242StoreMatch } from "@/lib/p242-open-store-paperwork-push/types";

export type P242DiscoveredApplicant = {
  candidate: BreezyCandidate;
  workflow: CandidateWorkflowRecord | null;
  store: P242StoreMatch;
  milesToStore: number | null;
  matchReason: string;
};

export type P242DiscoveryResult = {
  stores: P242StoreMatch[];
  applicants: P242DiscoveredApplicant[];
  positionIds: string[];
  jobsById: Map<string, BreezyJob>;
  notes: string[];
  warnings: string[];
};

function displayName(c: BreezyCandidate): string {
  const joined = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return joined || (c as { name?: string }).name || c.candidateId;
}

function normalizePhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

function milesBetween(
  homeCity: string | null | undefined,
  homeState: string | null | undefined,
  storeCity: string,
  storeState: string,
): number | null {
  const hc = normalizeCity(homeCity ?? "");
  const sc = normalizeCity(storeCity);
  const hs = normalizeText(homeState ?? "").toUpperCase();
  const ss = normalizeText(storeState).toUpperCase();
  if (hc && sc && hc === sc && (!hs || !ss || hs === ss)) return 0;

  const home = estimateGeoPoint(homeCity ?? "", homeState ?? "");
  const store = estimateGeoPoint(storeCity, storeState);
  if (!home || !store) return null;
  return Math.round(haversineMiles(home, store) * 10) / 10;
}

function toStoreMatch(m: OpenStoreMatch): P242StoreMatch {
  const matchReason =
    m.matchNotes[0] ??
    (m.confidence === "unmatched"
      ? "unmatched"
      : m.confidence === "ambiguous"
        ? "ambiguous"
        : `matched:${m.confidence}`);
  return {
    projectNo: m.open.projectNo,
    projectName: m.open.projectName,
    storeCity: m.open.city,
    storeState: m.open.state,
    storeLabel: `${m.open.city}, ${m.open.state}`,
    districtManager: m.open.districtManager || "Unassigned",
    sheetApplicantCount: m.open.applicantCount,
    breezyPostName: m.breezyPost?.name ?? null,
    positionId: m.positionId,
    positionName: m.positionName ?? m.breezyPost?.name ?? null,
    matchConfidence: m.confidence,
    matchReason,
    matchNotes: m.matchNotes,
  };
}

/**
 * Discover open stores (Applicant=Yes) and applicants on matched Breezy positions.
 * Prefers Breezy position location for store geography; home city is secondary.
 */
export async function discoverP242OpenStoreApplicants(input: {
  xlsxPath: string;
}): Promise<P242DiscoveryResult> {
  const notes: string[] = [];
  const warnings: string[] = [];

  const { opens, breezyPosts } = loadTrendsWorkbook(input.xlsxPath);
  const applicantOpens = opensWithApplicants(opens);
  notes.push(
    `Workbook: ${applicantOpens.length}/${opens.length} Opens with Applicant=Yes; ${breezyPosts.length} Breezy Posts rows.`,
  );

  let matches = matchOpensToBreezyPosts({ opens: applicantOpens, breezyPosts });
  const jobsResult = await fetchBreezyJobs("published");
  const jobsById = new Map<string, BreezyJob>();
  if (!jobsResult.ok) {
    warnings.push(`fetchBreezyJobs failed: ${jobsResult.error ?? "unknown"}`);
  } else {
    matches = attachLivePositionIds(matches, jobsResult.jobs);
    for (const job of jobsResult.jobs) {
      jobsById.set(job.jobId, job);
    }
    notes.push(`Resolved ${jobsResult.jobs.length} live published jobs.`);
  }

  const stores = matches.map(toStoreMatch);
  const positionIds = uniqueMatchedPositionIds(matches);
  notes.push(
    `Matched stores with positionId=${stores.filter((s) => s.positionId).length}; unique positions=${positionIds.length}.`,
  );

  const storeByPositionId = new Map<string, P242StoreMatch>();
  for (const store of stores) {
    if (!store.positionId) continue;
    // Prefer first / highest-applicant store already ordered by sheet matching path
    if (!storeByPositionId.has(store.positionId)) {
      storeByPositionId.set(store.positionId, store);
    }
  }

  const ingestion = await readIngestionStore();
  const workflows = await getCandidateWorkflowState();
  let candidates = listIngestedCandidates(ingestion);
  const allow = new Set(positionIds);

  // Prefer durable ingestion for discovery (fast, complete for open-store cohort).
  // Optional targeted per-position live fetch only when a matched position has zero
  // ingested applicants — avoids the broad smart-poll scan of ~60 unrelated jobs.
  const ingestedOnPositions = new Set(
    candidates.filter((c) => allow.has(c.positionId ?? "")).map((c) => c.positionId ?? ""),
  );
  const missingPositions = positionIds.filter((id) => !ingestedOnPositions.has(id));
  if (missingPositions.length > 0) {
    notes.push(
      `${missingPositions.length} matched position(s) have zero ingested applicants — attempting targeted Breezy fetch.`,
    );
    try {
      const { fetchBreezyCandidates } = await import("@/lib/breezy-api");
      for (const positionId of missingPositions.slice(0, 12)) {
        const result = await fetchBreezyCandidates({
          positionId,
          force: true,
          maxPages: 2,
          scanMode: "all",
        });
        if (!result.ok) {
          warnings.push(`Targeted fetch failed for ${positionId}: ${result.error}`);
          continue;
        }
        for (const live of result.candidates) {
          const id = String(live.candidateId || (live as { _id?: string })._id || "").trim();
          if (!id) continue;
          candidates.push({ ...live, candidateId: id, positionId: live.positionId ?? positionId });
        }
      }
    } catch (error) {
      warnings.push(
        `Targeted Breezy fetch skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    notes.push("All matched positions have ingested applicants — skipped live Breezy candidate scan.");
  }

  const onPositions = candidates.filter((c) => allow.has(c.positionId ?? ""));
  const deduped = dedupeBreezyCandidates(onPositions);
  notes.push(
    `Candidates on open-store positions: ${onPositions.length} raw → ${deduped.candidates.length} after id/email dedupe (dropped ${deduped.deduped}).`,
  );

  // Secondary phone-level dedupe tracking (keep first occurrence)
  const phoneOwner = new Map<string, string>();
  const applicants: P242DiscoveredApplicant[] = [];

  for (const c of deduped.candidates) {
    const id = String(c.candidateId || "").trim();
    if (!id) continue;
    const store = storeByPositionId.get(c.positionId ?? "");
    if (!store) continue;

    const phone = normalizePhone(c.phone);
    if (phone) {
      const owner = phoneOwner.get(phone);
      if (owner && owner !== id) {
        // Still include for classification as duplicate; mark via phone collision later
      } else {
        phoneOwner.set(phone, id);
      }
    }

    const wf = (workflows[id] as CandidateWorkflowRecord | undefined) ?? null;
    const miles = milesBetween(c.city, c.state, store.storeCity, store.storeState);
    applicants.push({
      candidate: c,
      workflow: wf,
      store,
      milesToStore: miles,
      matchReason: `Breezy position ${store.positionId} ↔ open store ${store.storeLabel} (${store.matchConfidence})`,
    });
  }

  // Stable sort: store label then name
  applicants.sort((a, b) => {
    const s = a.store.storeLabel.localeCompare(b.store.storeLabel);
    if (s !== 0) return s;
    return displayName(a.candidate).localeCompare(displayName(b.candidate));
  });

  notes.push(`Discovered ${applicants.length} applicant↔store matches.`);
  return { stores, applicants, positionIds, jobsById, notes, warnings };
}

export { displayName, normalizePhone, milesBetween, normalizeEmailFingerprint };
