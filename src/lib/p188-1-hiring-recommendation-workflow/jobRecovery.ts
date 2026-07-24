import { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
import type { P1881JobRecoveryResult } from "@/lib/p188-1-hiring-recommendation-workflow/types";

export type JobCatalogEntry = {
  jobId: string;
  friendlyId?: string | null;
  aliases?: string[];
  title?: string | null;
  city?: string | null;
  state?: string | null;
};

export type JobRecoverySignals = {
  candidateId: string;
  breezyPositionId?: string | null;
  friendlyId?: string | null;
  ingestionAlias?: string | null;
  historicalAlias?: string | null;
  title?: string | null;
  city?: string | null;
  state?: string | null;
  operatorConfirmedJobId?: string | null;
  catalog: JobCatalogEntry[];
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Resolve workflow job references without accepting ambiguous matches.
 */
export function recoverJobAssignment(
  signals: JobRecoverySignals,
  forceFlags?: { jobAssignmentRecovery: boolean },
): P1881JobRecoveryResult {
  const flags = readP1881Flags(
    forceFlags ? { jobAssignmentRecovery: forceFlags.jobAssignmentRecovery } : undefined,
  );
  if (!flags.jobAssignmentRecovery) {
    return {
      candidateId: signals.candidateId,
      resolved: false,
      jobId: null,
      jobLabel: null,
      source: null,
      ambiguous: false,
      candidates: [],
      detail: "P188_JOB_ASSIGNMENT_RECOVERY flag is off",
    };
  }

  const catalog = signals.catalog;
  const byId = new Map(catalog.map((j) => [j.jobId, j]));
  const hits: Array<{
    source: NonNullable<P1881JobRecoveryResult["source"]>;
    job: JobCatalogEntry;
  }> = [];

  const pushUnique = (
    source: NonNullable<P1881JobRecoveryResult["source"]>,
    job: JobCatalogEntry | undefined,
  ) => {
    if (!job) return;
    if (hits.some((h) => h.job.jobId === job.jobId)) return;
    hits.push({ source, job });
  };

  if (signals.operatorConfirmedJobId && byId.has(signals.operatorConfirmedJobId)) {
    pushUnique("operator_confirmed", byId.get(signals.operatorConfirmedJobId));
  }
  if (signals.breezyPositionId && byId.has(signals.breezyPositionId)) {
    pushUnique("breezy_position_id", byId.get(signals.breezyPositionId));
  }
  if (signals.friendlyId) {
    const match = catalog.find(
      (j) => norm(j.friendlyId) === norm(signals.friendlyId) || j.jobId === signals.friendlyId,
    );
    pushUnique("friendly_id", match);
  }
  if (signals.ingestionAlias) {
    const match = catalog.find(
      (j) =>
        (j.aliases ?? []).some((a) => norm(a) === norm(signals.ingestionAlias)) ||
        j.jobId === signals.ingestionAlias,
    );
    pushUnique("ingestion_alias", match);
  }
  if (signals.historicalAlias) {
    const match = catalog.find((j) =>
      (j.aliases ?? []).some((a) => norm(a) === norm(signals.historicalAlias)),
    );
    pushUnique("historical_alias", match);
  }

  if (signals.title && signals.city && signals.state) {
    const titleMatches = catalog.filter(
      (j) =>
        norm(j.title) === norm(signals.title) &&
        norm(j.city) === norm(signals.city) &&
        norm(j.state) === norm(signals.state),
    );
    if (titleMatches.length === 1) {
      pushUnique("unique_title_city_state", titleMatches[0]);
    } else if (titleMatches.length > 1) {
      return {
        candidateId: signals.candidateId,
        resolved: false,
        jobId: null,
        jobLabel: null,
        source: null,
        ambiguous: true,
        candidates: titleMatches.map((j) => j.jobId),
        detail: "Ambiguous title+city+state matches — operator confirmation required",
      };
    }
  }

  if (hits.length === 0) {
    return {
      candidateId: signals.candidateId,
      resolved: false,
      jobId: null,
      jobLabel: null,
      source: null,
      ambiguous: false,
      candidates: [],
      detail: "No job mapping signals resolved — operator review required",
    };
  }

  const distinct = [...new Set(hits.map((h) => h.job.jobId))];
  if (distinct.length > 1) {
    return {
      candidateId: signals.candidateId,
      resolved: false,
      jobId: null,
      jobLabel: null,
      source: null,
      ambiguous: true,
      candidates: distinct,
      detail: `Ambiguous job matches: ${distinct.join(", ")}`,
    };
  }

  const hit = hits[0]!;
  return {
    candidateId: signals.candidateId,
    resolved: true,
    jobId: hit.job.jobId,
    jobLabel: hit.job.title ?? hit.job.friendlyId ?? hit.job.jobId,
    source: hit.source,
    ambiguous: false,
    candidates: [hit.job.jobId],
    detail: `Resolved via ${hit.source}`,
  };
}
