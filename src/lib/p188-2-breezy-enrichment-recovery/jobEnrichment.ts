import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { JobCatalogEntry } from "@/lib/p188-1-hiring-recommendation-workflow/jobRecovery";
import { isEvidenceStale, type P1882EnrichmentBundle } from "@/lib/p188-2-breezy-enrichment-recovery/sources";
import type {
  P1882Confidence,
  P1882JobEnrichment,
  P1882JobSource,
} from "@/lib/p188-2-breezy-enrichment-recovery/types";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

type Hit = {
  source: P1882JobSource;
  job: JobCatalogEntry;
  evidenceReference: string;
  confidence: P1882Confidence;
  stale: boolean;
};

/**
 * P188.2 job priority:
 * position ID → job ID → friendly → ingestion/legacy alias → approved mapping →
 * unique title+city+state → operator confirmed.
 * Refuse ambiguous title-only / conflicting / stale.
 */
export function resolveJobEnrichment(
  workflow: CandidateWorkflowRecord,
  bundle: P1882EnrichmentBundle,
  nowMs = Date.now(),
): P1882JobEnrichment {
  const candidateId = workflow.candidateId;
  const breezy = bundle.breezyCandidatesById[candidateId];
  const catalog = bundle.jobsCatalog;
  const byId = new Map(catalog.map((j) => [j.jobId, j]));
  const approved = bundle.approvedMappingByCandidate[candidateId];
  const operatorJobId = bundle.operatorConfirmedJob?.[candidateId] ?? null;

  const hits: Hit[] = [];
  const push = (hit: Hit | null) => {
    if (!hit) return;
    if (hits.some((h) => h.job.jobId === hit.job.jobId && h.source === hit.source)) return;
    hits.push(hit);
  };

  const positionId = breezy?.positionId?.trim() || null;
  // Exact Breezy position/job IDs are structural joins — not time-stale.
  if (positionId && byId.has(positionId)) {
    push({
      source: "breezy_position_id",
      job: byId.get(positionId)!,
      evidenceReference: `breezy_candidate:${candidateId}:positionId=${positionId}`,
      confidence: "high",
      stale: false,
    });
  } else if (positionId) {
    // Position ID is authoritative even if catalog entry is sparse — synthesize.
    push({
      source: "breezy_position_id",
      job: {
        jobId: positionId,
        title: breezy?.positionName || null,
        city: breezy?.city || null,
        state: breezy?.state || null,
      },
      evidenceReference: `breezy_candidate:${candidateId}:positionId=${positionId}`,
      confidence: "high",
      stale: false,
    });
  }

  // breezy_job_id: same as position when Breezy uses jobId synonym on catalog
  const breezyJobId = (breezy as { jobId?: string } | undefined)?.jobId?.trim();
  if (breezyJobId && byId.has(breezyJobId)) {
    push({
      source: "breezy_job_id",
      job: byId.get(breezyJobId)!,
      evidenceReference: `breezy_candidate:${candidateId}:jobId=${breezyJobId}`,
      confidence: "high",
      stale: false,
    });
  }

  const friendly = (breezy as { friendlyId?: string } | undefined)?.friendlyId;
  // Try positionName as friendly-style id match against catalog friendlyId
  for (const j of catalog) {
    if (j.friendlyId && friendly && norm(j.friendlyId) === norm(friendly)) {
      push({
        source: "friendly_id",
        job: j,
        evidenceReference: `friendly_id:${friendly}`,
        confidence: "high",
        stale: false,
      });
    }
  }

  // Ingestion/legacy alias: positionName exact match against catalog alias or friendlyId
  const aliasNeedle = breezy?.positionName?.trim();
  if (aliasNeedle) {
    for (const j of catalog) {
      const aliases = [j.friendlyId, ...(j.aliases ?? [])].filter(Boolean) as string[];
      if (aliases.some((a) => norm(a) === norm(aliasNeedle))) {
        push({
          source: "ingestion_alias",
          job: j,
          evidenceReference: `ingestion_alias:${aliasNeedle}`,
          confidence: "medium",
          stale: false,
        });
      }
    }
  }

  if (approved && byId.has(approved.jobId)) {
    push({
      source: "approved_mapping",
      job: byId.get(approved.jobId)!,
      evidenceReference: `approved_mapping:${approved.evidenceId}`,
      confidence: "high",
      stale: isEvidenceStale(approved.at, nowMs),
    });
  } else if (approved) {
    push({
      source: "approved_mapping",
      job: { jobId: approved.jobId, title: null, city: null, state: null },
      evidenceReference: `approved_mapping:${approved.evidenceId}`,
      confidence: "high",
      stale: isEvidenceStale(approved.at, nowMs),
    });
  }

  const title = breezy?.positionName || null;
  const city = breezy?.city || null;
  const state = breezy?.state || null;
  if (title && city && state) {
    const tcs = catalog.filter(
      (j) =>
        norm(j.title) === norm(title) &&
        norm(j.city) === norm(city) &&
        norm(j.state) === norm(state),
    );
    if (tcs.length === 1) {
      push({
        source: "unique_title_city_state",
        job: tcs[0],
        evidenceReference: `tcs:${norm(title)}|${norm(city)}|${norm(state)}`,
        confidence: "medium",
        stale: false,
      });
    } else if (tcs.length > 1) {
      // Will surface as ambiguous if this is the only path later
      for (const j of tcs) {
        push({
          source: "unique_title_city_state",
          job: j,
          evidenceReference: `tcs_ambiguous:${j.jobId}`,
          confidence: "low",
          stale: false,
        });
      }
    }
    // title-only (no city/state uniqueness) intentionally not pushed
  }

  if (operatorJobId) {
    const job = byId.get(operatorJobId) ?? {
      jobId: operatorJobId,
      title: null,
      city: null,
      state: null,
    };
    push({
      source: "operator_confirmed",
      job,
      evidenceReference: `operator_confirmed_job:${candidateId}`,
      confidence: "high",
      stale: false,
    });
  }

  if (hits.length === 0) {
    return {
      candidateId,
      resolved: false,
      jobId: null,
      jobTitle: null,
      city: null,
      state: null,
      source: null,
      confidence: "none",
      evidenceReference: null,
      ambiguous: false,
      conflicting: false,
      staleEvidence: false,
      alternateMatches: [],
      operatorActionRequired: "Provide operator-confirmed job mapping or Breezy position ID",
      detail: "No authoritative job signals",
    };
  }

  // Prefer priority order among non-stale hits; refuse multi distinct jobs at same step or conflicts.
  const priority: P1882JobSource[] = [
    "breezy_position_id",
    "breezy_job_id",
    "friendly_id",
    "ingestion_alias",
    "approved_mapping",
    "unique_title_city_state",
    "operator_confirmed",
  ];

  let chosen: Hit | null = null;
  for (const source of priority) {
    const atLevel = hits.filter((h) => h.source === source && !h.stale);
    if (atLevel.length === 0) continue;
    const uniqueIds = [...new Set(atLevel.map((h) => h.job.jobId))];
    if (uniqueIds.length > 1) {
      return {
        candidateId,
        resolved: false,
        jobId: null,
        jobTitle: null,
        city: null,
        state: null,
        source: null,
        confidence: "none",
        evidenceReference: atLevel.map((h) => h.evidenceReference).join("|"),
        ambiguous: true,
        conflicting: false,
        staleEvidence: false,
        alternateMatches: uniqueIds,
        operatorActionRequired: "Select job from ambiguous matches",
        detail: `Ambiguous ${source} matches (${uniqueIds.length})`,
      };
    }
    if (!chosen) {
      chosen = atLevel[0];
      continue;
    }
    if (atLevel[0].job.jobId !== chosen.job.jobId) {
      return {
        candidateId,
        resolved: false,
        jobId: null,
        jobTitle: null,
        city: null,
        state: null,
        source: null,
        confidence: "none",
        evidenceReference: `${chosen.evidenceReference}|${atLevel[0].evidenceReference}`,
        ambiguous: true,
        conflicting: true,
        staleEvidence: false,
        alternateMatches: [chosen.job.jobId, atLevel[0].job.jobId],
        operatorActionRequired: "Resolve conflicting job evidence",
        detail: `Conflict between ${chosen.source} and ${source}`,
      };
    }
  }

  if (!chosen) {
    return {
      candidateId,
      resolved: false,
      jobId: null,
      jobTitle: null,
      city: null,
      state: null,
      source: null,
      confidence: "none",
      evidenceReference: hits[0]?.evidenceReference ?? null,
      ambiguous: false,
      conflicting: false,
      staleEvidence: true,
      alternateMatches: hits.map((h) => h.job.jobId),
      operatorActionRequired: "Refresh stale job evidence",
      detail: "Only stale job evidence present",
    };
  }

  return {
    candidateId,
    resolved: true,
    jobId: chosen.job.jobId,
    jobTitle: chosen.job.title ?? breezy?.positionName ?? null,
    city: chosen.job.city ?? breezy?.city ?? null,
    state: chosen.job.state ?? breezy?.state ?? null,
    source: chosen.source,
    confidence: chosen.confidence,
    evidenceReference: chosen.evidenceReference,
    ambiguous: false,
    conflicting: false,
    staleEvidence: false,
    alternateMatches: [],
    operatorActionRequired: null,
    detail: `Resolved via ${chosen.source}`,
  };
}
