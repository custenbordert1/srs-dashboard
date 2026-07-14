import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type { MappingReviewRecord } from "@/lib/p108-intelligent-project-mapping/types";
import type { JobCatalogEntry } from "@/lib/p188-1-hiring-recommendation-workflow/jobRecovery";
import type { P1881BypassFinding } from "@/lib/p188-1-hiring-recommendation-workflow/types";

export type P1882EnrichmentBundle = {
  workflows: CandidateWorkflowRecord[];
  breezyCandidatesById: Record<string, BreezyCandidate>;
  jobsCatalog: JobCatalogEntry[];
  /** Latest executed production assignment recruiter by candidate. */
  executedAssignmentByCandidate: Record<
    string,
    { recruiter: string; at: string; evidenceId: string }
  >;
  /** Approved mapping position by candidate. */
  approvedMappingByCandidate: Record<
    string,
    { jobId: string; evidenceId: string; at: string }
  >;
  /** Operator-confirmed maps (optional inject). */
  operatorConfirmedRecruiter?: Record<string, string>;
  operatorConfirmedJob?: Record<string, string>;
  /** Unique territory → recruiter when truly unique. */
  territoryRecruiterUnique?: Record<string, string>;
  bypassFindings: P1881BypassFinding[];
  loadedAt: string;
};

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export function isEvidenceStale(at: string | null | undefined, nowMs = Date.now()): boolean {
  if (!at) return true;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > STALE_MS;
}

export function buildJobsCatalogFromSources(input: {
  breezyJobs?: BreezyJob[];
  breezyCandidates?: BreezyCandidate[];
}): JobCatalogEntry[] {
  const byId = new Map<string, JobCatalogEntry>();

  for (const job of input.breezyJobs ?? []) {
    byId.set(job.jobId, {
      jobId: job.jobId,
      friendlyId: job.friendlyId ?? null,
      title: job.name,
      city: job.city,
      state: job.state,
      aliases: job.friendlyId ? [job.friendlyId] : [],
    });
  }

  for (const c of input.breezyCandidates ?? []) {
    if (!c.positionId?.trim()) continue;
    const existing = byId.get(c.positionId);
    if (existing) {
      if (!existing.title && c.positionName) existing.title = c.positionName;
      if (!existing.city && c.city) existing.city = c.city;
      if (!existing.state && c.state) existing.state = c.state;
      continue;
    }
    byId.set(c.positionId, {
      jobId: c.positionId,
      title: c.positionName || null,
      city: c.city || null,
      state: c.state || null,
      aliases: [],
    });
  }

  return [...byId.values()];
}

/**
 * Only production-executed assignments count as authoritative audit evidence.
 * Simulations are ignored.
 */
export function indexExecutedAssignmentAudits(
  events: P158AssignmentAuditEvent[],
  nowMs = Date.now(),
): Record<string, { recruiter: string; at: string; evidenceId: string; stale: boolean }> {
  const latest: Record<
    string,
    { recruiter: string; at: string; evidenceId: string; stale: boolean }
  > = {};
  for (const e of events) {
    if (e.action !== "assigned") continue;
    if (e.executionMode !== "production") continue;
    const recruiter = (e.afterRecruiter ?? e.recruiter ?? "").trim();
    if (!recruiter || recruiter === "Unassigned") continue;
    const prev = latest[e.candidateId];
    if (prev && prev.at >= e.at) continue;
    latest[e.candidateId] = {
      recruiter,
      at: e.at,
      evidenceId: e.id,
      stale: isEvidenceStale(e.at, nowMs),
    };
  }
  return latest;
}

export function indexApprovedMappings(
  records: Array<MappingReviewRecord & { decidedAt?: string }>,
): Record<string, { jobId: string; evidenceId: string; at: string }> {
  const out: Record<string, { jobId: string; evidenceId: string; at: string }> = {};
  for (const r of records) {
    if (r.action !== "approve" && (r as { action?: string }).action !== "approved") continue;
    const jobId = r.recommendedPositionId?.trim();
    if (!jobId) continue;
    const at = r.decidedAt ?? new Date(0).toISOString();
    const prev = out[r.candidateId];
    if (prev && prev.at >= at) continue;
    out[r.candidateId] = {
      jobId,
      evidenceId: `${r.candidateId}:${jobId}`,
      at,
    };
  }
  return out;
}

export function extractBreezyAssignee(candidate: BreezyCandidate | null | undefined): string | null {
  if (!candidate) return null;
  const raw = candidate as unknown as Record<string, unknown>;
  const nested = (path: string[]): string | null => {
    let cur: unknown = raw;
    for (const key of path) {
      if (!cur || typeof cur !== "object") return null;
      cur = (cur as Record<string, unknown>)[key];
    }
    return typeof cur === "string" && cur.trim() ? cur.trim() : null;
  };
  return (
    nested(["recruiter", "name"]) ||
    nested(["owner", "name"]) ||
    nested(["assigned_to", "name"]) ||
    nested(["user", "name"]) ||
    (typeof raw.recruiter === "string" ? raw.recruiter.trim() : null) ||
    (typeof raw.owner === "string" ? raw.owner.trim() : null) ||
    null
  );
}

export function buildEnrichmentBundle(input: {
  workflows: CandidateWorkflowRecord[];
  breezyCandidates?: BreezyCandidate[];
  breezyJobs?: BreezyJob[];
  assignmentAudits?: P158AssignmentAuditEvent[];
  mappingReviews?: MappingReviewRecord[];
  bypassFindings?: P1881BypassFinding[];
  operatorConfirmedRecruiter?: Record<string, string>;
  operatorConfirmedJob?: Record<string, string>;
  territoryRecruiterUnique?: Record<string, string>;
  nowMs?: number;
}): P1882EnrichmentBundle {
  const breezyList = input.breezyCandidates ?? [];
  const byId: Record<string, BreezyCandidate> = {};
  for (const c of breezyList) byId[c.candidateId] = c;

  const executed = indexExecutedAssignmentAudits(
    input.assignmentAudits ?? [],
    input.nowMs ?? Date.now(),
  );
  const executedClean: P1882EnrichmentBundle["executedAssignmentByCandidate"] = {};
  for (const [id, row] of Object.entries(executed)) {
    if (row.stale) continue;
    executedClean[id] = {
      recruiter: row.recruiter,
      at: row.at,
      evidenceId: row.evidenceId,
    };
  }

  return {
    workflows: input.workflows,
    breezyCandidatesById: byId,
    jobsCatalog: buildJobsCatalogFromSources({
      breezyJobs: input.breezyJobs,
      breezyCandidates: breezyList,
    }),
    executedAssignmentByCandidate: executedClean,
    approvedMappingByCandidate: indexApprovedMappings(input.mappingReviews ?? []),
    operatorConfirmedRecruiter: input.operatorConfirmedRecruiter,
    operatorConfirmedJob: input.operatorConfirmedJob,
    territoryRecruiterUnique: input.territoryRecruiterUnique,
    bypassFindings: input.bypassFindings ?? [],
    loadedAt: new Date().toISOString(),
  };
}
