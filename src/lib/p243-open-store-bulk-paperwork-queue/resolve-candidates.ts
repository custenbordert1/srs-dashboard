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
  normalizePositionKey,
  normalizeText,
} from "@/lib/open-stores-paperwork-send/normalize";
import { normalizeEmailFingerprint } from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import { normalizePhone, displayName as breezyDisplayName } from "@/lib/p242-open-store-paperwork-push/discover";
import type {
  P243OsbpqMatchMethod,
  P243OsbpqSheetRow,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

export type P243OsbpqResolvedRow = {
  sheet: P243OsbpqSheetRow;
  candidate: BreezyCandidate | null;
  workflow: CandidateWorkflowRecord | null;
  job: BreezyJob | null;
  jobsLoaded: boolean;
  matchMethod: P243OsbpqMatchMethod;
  matchConfidence: "high" | "medium" | "low" | "none";
  ambiguous: boolean;
  milesToStore: number | null;
  resolveDetail: string | null;
};

function displayName(c: Pick<BreezyCandidate, "firstName" | "lastName" | "candidateId">): string {
  return breezyDisplayName(c as BreezyCandidate);
}

function namesEqual(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

function positionsLooselyEqual(a: string, b: string): boolean {
  const na = normalizePositionKey(a);
  const nb = normalizePositionKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Containment for truncated titles
  return na.includes(nb) || nb.includes(na);
}

function projectBrand(project: string): "five_below" | "dollar_tree" | "other" {
  const p = normalizeText(project);
  if (p.includes("dollar tree") || p.includes("family dollar")) return "dollar_tree";
  if (p.includes("five below")) return "five_below";
  return "other";
}

function positionSuggestsBrand(positionName: string): "five_below" | "dollar_tree" | "other" {
  const p = normalizeText(positionName);
  if (p.includes("dollar tree") || p.includes("family dollar")) return "dollar_tree";
  if (p.includes("five below")) return "five_below";
  return "other";
}

export function projectMatchesPosition(project: string, positionName: string): boolean {
  const pb = projectBrand(project);
  const jb = positionSuggestsBrand(positionName);
  if (pb === "other" || jb === "other") return true;
  return pb === jb;
}

export function milesBetween(
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

function buildEmailIndex(candidates: BreezyCandidate[]): Map<string, BreezyCandidate[]> {
  const map = new Map<string, BreezyCandidate[]>();
  for (const c of candidates) {
    const fp = normalizeEmailFingerprint(c.email);
    if (!fp) continue;
    if (!map.has(fp)) map.set(fp, []);
    map.get(fp)!.push(c);
  }
  return map;
}

function buildPhoneIndex(candidates: BreezyCandidate[]): Map<string, BreezyCandidate[]> {
  const map = new Map<string, BreezyCandidate[]>();
  for (const c of candidates) {
    const phone = normalizePhone(c.phone);
    if (!phone) continue;
    if (!map.has(phone)) map.set(phone, []);
    map.get(phone)!.push(c);
  }
  return map;
}

function buildNameIndex(candidates: BreezyCandidate[]): Map<string, BreezyCandidate[]> {
  const map = new Map<string, BreezyCandidate[]>();
  for (const c of candidates) {
    const key = normalizeText(displayName(c));
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

function pickBestAmong(
  matches: BreezyCandidate[],
  sheet: P243OsbpqSheetRow,
  workflows: Record<string, CandidateWorkflowRecord>,
): { candidate: BreezyCandidate | null; ambiguous: boolean } {
  if (matches.length === 0) return { candidate: null, ambiguous: false };
  if (matches.length === 1) return { candidate: matches[0]!, ambiguous: false };

  const exactPos = matches.filter((c) => positionsLooselyEqual(c.positionName ?? "", sheet.position));
  const pool = exactPos.length > 0 ? exactPos : matches;

  // If still multiple after position filter and no clear paperwork winner → ambiguous
  const rank = (c: BreezyCandidate): number => {
    const wf = workflows[c.candidateId];
    if (!wf) return 0;
    if (wf.workflowStatus === "Signed" || wf.paperworkStatus === "signed") return 5;
    if (wf.signatureRequestId) return 4;
    if (wf.workflowStatus === "Paperwork Sent" || wf.paperworkStatus === "sent") return 3;
    if (wf.workflowStatus === "Paperwork Needed") return 2;
    return 1;
  };
  const sorted = [...pool].sort((a, b) => rank(b) - rank(a));
  if (rank(sorted[0]!) >= 2) {
    return { candidate: sorted[0]!, ambiguous: false };
  }
  if (exactPos.length === 1) {
    return { candidate: exactPos[0]!, ambiguous: false };
  }
  if (pool.length > 1 && exactPos.length !== 1) {
    return { candidate: null, ambiguous: true };
  }
  return { candidate: sorted[0]!, ambiguous: false };
}

function resolveOne(
  sheet: P243OsbpqSheetRow,
  indexes: {
    byEmail: Map<string, BreezyCandidate[]>;
    byPhone: Map<string, BreezyCandidate[]>;
    byName: Map<string, BreezyCandidate[]>;
    byId: Map<string, BreezyCandidate>;
  },
  workflows: Record<string, CandidateWorkflowRecord>,
): {
  candidate: BreezyCandidate | null;
  method: P243OsbpqMatchMethod;
  confidence: "high" | "medium" | "low" | "none";
  ambiguous: boolean;
  detail: string | null;
} {
  // Optional embedded id in email local-part is not used; sheet has no Breezy ID column.
  // Still support if Candidate field looks like a hex id.
  if (/^[a-f0-9]{10,}$/i.test(sheet.candidateName.trim())) {
    const hit = indexes.byId.get(sheet.candidateName.trim().toLowerCase());
    if (hit) {
      return {
        candidate: hit,
        method: "breezy_id",
        confidence: "high",
        ambiguous: false,
        detail: null,
      };
    }
  }

  const emailFp = normalizeEmailFingerprint(sheet.email);
  if (emailFp) {
    const matches = indexes.byEmail.get(emailFp) ?? [];
    const picked = pickBestAmong(matches, sheet, workflows);
    if (picked.ambiguous) {
      return {
        candidate: null,
        method: "normalized_email",
        confidence: "none",
        ambiguous: true,
        detail: `ambiguous_email_matches=${matches.length}`,
      };
    }
    if (picked.candidate) {
      return {
        candidate: picked.candidate,
        method: "normalized_email",
        confidence: "high",
        ambiguous: false,
        detail: null,
      };
    }
  }

  if (sheet.phone) {
    const phoneMatches = (indexes.byPhone.get(sheet.phone) ?? []).filter((c) =>
      namesEqual(displayName(c), sheet.candidateName),
    );
    if (phoneMatches.length === 1) {
      return {
        candidate: phoneMatches[0]!,
        method: "phone_name",
        confidence: "high",
        ambiguous: false,
        detail: null,
      };
    }
    if (phoneMatches.length > 1) {
      const picked = pickBestAmong(phoneMatches, sheet, workflows);
      if (picked.ambiguous || !picked.candidate) {
        return {
          candidate: null,
          method: "phone_name",
          confidence: "none",
          ambiguous: true,
          detail: `ambiguous_phone_name_matches=${phoneMatches.length}`,
        };
      }
      return {
        candidate: picked.candidate,
        method: "phone_name",
        confidence: "medium",
        ambiguous: false,
        detail: null,
      };
    }
  }

  // Name + position (never name alone)
  const nameMatches = (indexes.byName.get(normalizeText(sheet.candidateName)) ?? []).filter((c) =>
    positionsLooselyEqual(c.positionName ?? "", sheet.position),
  );
  if (nameMatches.length === 1) {
    return {
      candidate: nameMatches[0]!,
      method: "name_position",
      confidence: "medium",
      ambiguous: false,
      detail: null,
    };
  }
  if (nameMatches.length > 1) {
    return {
      candidate: null,
      method: "name_position",
      confidence: "none",
      ambiguous: true,
      detail: `ambiguous_name_position_matches=${nameMatches.length}`,
    };
  }

  return {
    candidate: null,
    method: "none",
    confidence: "none",
    ambiguous: false,
    detail: "no_match",
  };
}

export async function resolveOpenStoreSheetCandidates(input: {
  rows: P243OsbpqSheetRow[];
}): Promise<{
  resolved: P243OsbpqResolvedRow[];
  jobsById: Map<string, BreezyJob>;
  jobsLoaded: boolean;
  notes: string[];
  warnings: string[];
}> {
  const notes: string[] = [];
  const warnings: string[] = [];

  const ingestion = await readIngestionStore();
  const workflows = await getCandidateWorkflowState();
  const candidates = listIngestedCandidates(ingestion);
  notes.push(`Ingestion store candidates available: ${candidates.length}`);

  const jobsResult = await fetchBreezyJobs("published");
  const jobsById = new Map<string, BreezyJob>();
  let jobsLoaded = false;
  if (!jobsResult.ok) {
    warnings.push(`fetchBreezyJobs failed: ${jobsResult.error ?? "unknown"}`);
  } else {
    jobsLoaded = true;
    for (const job of jobsResult.jobs) jobsById.set(job.jobId, job);
    notes.push(`Loaded ${jobsResult.jobs.length} published Breezy jobs.`);
  }

  const indexes = {
    byEmail: buildEmailIndex(candidates),
    byPhone: buildPhoneIndex(candidates),
    byName: buildNameIndex(candidates),
    byId: new Map(candidates.map((c) => [c.candidateId.toLowerCase(), c])),
  };

  // Targeted live fetch for sheet rows that miss ingestion (by matching position title).
  const unresolvedEmails = new Set(
    input.rows
      .filter((r) => r.email && !(indexes.byEmail.get(normalizeEmailFingerprint(r.email) ?? "") ?? []).length)
      .map((r) => r.email!),
  );
  if (unresolvedEmails.size > 0 && jobsLoaded) {
    notes.push(
      `${unresolvedEmails.size} sheet email(s) missing from ingestion — attempting targeted position fetches.`,
    );
    try {
      const { fetchBreezyCandidates } = await import("@/lib/breezy-api");
      const { normalizePositionKey } = await import("@/lib/open-stores-paperwork-send/normalize");
      const neededPositions = new Set(
        input.rows
          .filter((r) => r.email && unresolvedEmails.has(r.email))
          .map((r) => normalizePositionKey(r.position)),
      );
      const jobMatches = [...jobsById.values()].filter((j) =>
        neededPositions.has(normalizePositionKey(j.name)),
      );
      for (const job of jobMatches.slice(0, 20)) {
        const result = await fetchBreezyCandidates({
          positionId: job.jobId,
          force: true,
          maxPages: 2,
          scanMode: "all",
        });
        if (!result.ok) continue;
        for (const live of result.candidates) {
          const id = String(live.candidateId || "").trim();
          if (!id) continue;
          const enriched = { ...live, candidateId: id, positionId: live.positionId || job.jobId };
          candidates.push(enriched);
          const fp = normalizeEmailFingerprint(enriched.email);
          if (fp) {
            if (!indexes.byEmail.has(fp)) indexes.byEmail.set(fp, []);
            indexes.byEmail.get(fp)!.push(enriched);
          }
          const phone = normalizePhone(enriched.phone);
          if (phone) {
            if (!indexes.byPhone.has(phone)) indexes.byPhone.set(phone, []);
            indexes.byPhone.get(phone)!.push(enriched);
          }
          const nameKey = normalizeText(displayName(enriched));
          if (nameKey) {
            if (!indexes.byName.has(nameKey)) indexes.byName.set(nameKey, []);
            indexes.byName.get(nameKey)!.push(enriched);
          }
          indexes.byId.set(id.toLowerCase(), enriched);
        }
      }
      notes.push(`After targeted fetch, ingestion+live pool size=${candidates.length}.`);
    } catch (error) {
      warnings.push(
        `Targeted Breezy fetch skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const resolved: P243OsbpqResolvedRow[] = [];
  for (const sheet of input.rows) {
    const hit = resolveOne(sheet, indexes, workflows);
    const candidate = hit.candidate;
    const workflow = candidate
      ? ((workflows[candidate.candidateId] as CandidateWorkflowRecord | undefined) ?? null)
      : null;
    const job = candidate?.positionId ? (jobsById.get(candidate.positionId) ?? null) : null;

    const homeCity = candidate?.city || sheet.candidateCity || null;
    const homeState = candidate?.state || sheet.candidateState || null;
    const miles = milesBetween(homeCity, homeState, sheet.storeCity, sheet.storeState);

    resolved.push({
      sheet,
      candidate,
      workflow,
      job,
      jobsLoaded,
      matchMethod: hit.method,
      matchConfidence: hit.confidence,
      ambiguous: hit.ambiguous,
      milesToStore: miles,
      resolveDetail: hit.detail,
    });
  }

  const matched = resolved.filter((r) => r.candidate).length;
  const ambiguous = resolved.filter((r) => r.ambiguous).length;
  const unresolved = resolved.filter((r) => !r.candidate && !r.ambiguous).length;
  notes.push(
    `Resolved ${matched}/${resolved.length}; ambiguous=${ambiguous}; unresolved=${unresolved}.`,
  );

  return { resolved, jobsById, jobsLoaded, notes, warnings };
}

export { displayName, normalizePhone, projectBrand };
