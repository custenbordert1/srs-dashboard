import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildJobsLookupMap } from "@/lib/breezy-global-candidates";
import { normalizePositionTitle } from "@/lib/test-cohort-validation/normalize-position-title";
import type {
  P1851JobMappingAlias,
  P1851JobMappingResult,
  P1851MappingMethod,
  P1851OnboardingJobClassification,
} from "@/lib/p185-1-paperwork-eligibility-recovery/types";

function normalizeState(state: string | undefined | null): string {
  return (state ?? "").trim().toUpperCase();
}

function normalizeCity(city: string | undefined | null): string {
  return normalizePositionTitle(city ?? "");
}

function classifyJobStatus(job: BreezyJob | null | undefined): P1851OnboardingJobClassification {
  if (!job) return "unknown";
  const status = job.status.trim().toLowerCase();
  if (status === "published" || status === "open" || status === "active") return "published_accepting";
  if (status === "draft" || status === "unpublished") return "open_unpublished";
  if (status === "closed") return "closed";
  if (status === "archived") return "archived";
  if (status === "deleted" || status === "removed") return "removed";
  return "unknown";
}

function isAcceptingPublished(job: BreezyJob | null | undefined): boolean {
  if (!job) return false;
  const status = job.status.trim().toLowerCase();
  return status === "published" || status === "open" || status === "active";
}

export type P1851ApprovedMappingHint = {
  candidateId: string;
  closedPositionId: string;
  recommendedPositionId: string;
};

export function resolveP1851JobMapping(input: {
  row: ScoredCandidateWorkflowRow;
  publishedJobs: BreezyJob[];
  closedJobs?: BreezyJob[];
  aliases?: P1851JobMappingAlias[];
  approvedMappings?: P1851ApprovedMappingHint[];
  /** When true, closed/historical jobs may still accept onboarding if selected. */
  selectedForHiring?: boolean;
}): P1851JobMappingResult {
  const originalPositionId = input.row.positionId?.trim() || null;
  const publishedLookup = buildJobsLookupMap(input.publishedJobs);
  const closedLookup = buildJobsLookupMap(input.closedJobs ?? []);
  const allLookup = new Map([...closedLookup, ...publishedLookup]);

  const base = (
    partial: Partial<P1851JobMappingResult> &
      Pick<P1851JobMappingResult, "mappingMethod" | "resolvedPositionId" | "confidence">,
  ): P1851JobMappingResult => {
    const resolvedId = partial.resolvedPositionId;
    const job = resolvedId ? allLookup.get(resolvedId) ?? publishedLookup.get(resolvedId) : null;
    const classification =
      partial.onboardingJobClassification ?? classifyJobStatus(job);
    const publishedAccepting = isAcceptingPublished(job);
    const acceptingForOnboarding =
      partial.acceptingForOnboarding ??
      (publishedAccepting ||
        (Boolean(input.selectedForHiring) &&
          (classification === "closed" ||
            classification === "open_unpublished" ||
            classification === "historical_valid_for_onboarding")));

    return {
      candidateId: input.row.candidateId,
      originalPositionId,
      resolvedPositionId: resolvedId,
      mappingMethod: partial.mappingMethod,
      confidence: partial.confidence,
      ambiguity: partial.ambiguity ?? false,
      jobOpen: publishedAccepting || classification === "open_unpublished",
      jobAcceptingCandidates: publishedAccepting,
      onboardingJobClassification:
        acceptingForOnboarding && classification === "closed"
          ? "historical_valid_for_onboarding"
          : classification,
      acceptingForOnboarding,
      supportingFields: {
        positionName: input.row.positionName ?? null,
        city: input.row.city ?? null,
        state: input.row.state ?? null,
        positionPipelineStatus: input.row.positionPipelineStatus ?? null,
        jobStatus: job?.status ?? null,
        jobName: job?.name ?? null,
        ...(partial.supportingFields ?? {}),
      },
    };
  };

  if (!originalPositionId) {
    return base({
      mappingMethod: "unresolved",
      resolvedPositionId: null,
      confidence: "none",
      supportingFields: { reason: "missing_position_id" },
    });
  }

  // 1. Exact Breezy position ID (published or closed, including friendlyId via lookup)
  if (publishedLookup.has(originalPositionId)) {
    const job = publishedLookup.get(originalPositionId)!;
    return base({
      mappingMethod: "exact_breezy_position_id",
      resolvedPositionId: job.jobId,
      confidence: "high",
      supportingFields: { matchedVia: "published_lookup" },
    });
  }
  if (closedLookup.has(originalPositionId)) {
    const job = closedLookup.get(originalPositionId)!;
    return base({
      mappingMethod: "exact_breezy_position_id",
      resolvedPositionId: job.jobId,
      confidence: "high",
      onboardingJobClassification: classifyJobStatus(job),
      supportingFields: { matchedVia: "closed_lookup" },
    });
  }

  // 2 / 3 / 4 — persisted alias, ingestion relationship, verified legacy (alias store)
  const alias = (input.aliases ?? []).find((a) => a.originalPositionId === originalPositionId);
  if (alias?.resolvedPositionId && allLookup.has(alias.resolvedPositionId)) {
    return base({
      mappingMethod: alias.mappingMethod === "unresolved" ? "persisted_alias" : alias.mappingMethod,
      resolvedPositionId: alias.resolvedPositionId,
      confidence: alias.confidence === "none" ? "medium" : alias.confidence,
      supportingFields: { matchedVia: "persisted_alias" },
    });
  }

  // P109 approved mapping (verified legacy / operator relationship)
  const approved = (input.approvedMappings ?? []).find(
    (m) =>
      m.candidateId === input.row.candidateId &&
      m.closedPositionId === originalPositionId &&
      allLookup.has(m.recommendedPositionId),
  );
  if (approved) {
    return base({
      mappingMethod: "p109_approved_mapping",
      resolvedPositionId: approved.recommendedPositionId,
      confidence: "high",
      supportingFields: { matchedVia: "p109_approved" },
    });
  }

  // Also allow approved mapping by closed ID alone when candidate matches any approved for that closed id
  const approvedByClosed = (input.approvedMappings ?? []).find(
    (m) => m.closedPositionId === originalPositionId && allLookup.has(m.recommendedPositionId),
  );
  if (approvedByClosed) {
    return base({
      mappingMethod: "verified_legacy_id",
      resolvedPositionId: approvedByClosed.recommendedPositionId,
      confidence: "high",
      supportingFields: {
        matchedVia: "p109_closed_position_alias",
        approvedForCandidate: approvedByClosed.candidateId,
      },
    });
  }

  // 5. Unique normalized title + city + state (never title-only)
  const title = (input.row.positionName ?? "").trim();
  const city = normalizeCity(input.row.city);
  const state = normalizeState(input.row.state);
  if (title && city && state) {
    const matches = input.publishedJobs.filter((job) => {
      const titleOk =
        normalizePositionTitle(job.name) === normalizePositionTitle(title) ||
        normalizePositionTitle(job.name).includes(normalizePositionTitle(title)) ||
        normalizePositionTitle(title).includes(normalizePositionTitle(job.name));
      return (
        titleOk &&
        normalizeCity(job.city) === city &&
        normalizeState(job.state) === state
      );
    });
    if (matches.length === 1) {
      return base({
        mappingMethod: "unique_title_city_state",
        resolvedPositionId: matches[0]!.jobId,
        confidence: "medium",
        supportingFields: { matchedVia: "unique_title_city_state" },
      });
    }
    if (matches.length > 1) {
      return base({
        mappingMethod: "unresolved",
        resolvedPositionId: null,
        confidence: "none",
        ambiguity: true,
        supportingFields: {
          reason: "ambiguous_title_city_state",
          matchCount: matches.length,
        },
      });
    }
  }

  return base({
    mappingMethod: "unresolved",
    resolvedPositionId: null,
    confidence: "none",
    supportingFields: { reason: "no_deterministic_match" },
  });
}

export function mappingMethodRank(method: P1851MappingMethod): number {
  const order: P1851MappingMethod[] = [
    "exact_breezy_position_id",
    "exact_external_job_id",
    "ingestion_relationship",
    "verified_legacy_id",
    "p109_approved_mapping",
    "persisted_alias",
    "unique_title_city_state",
    "unresolved",
  ];
  return order.indexOf(method);
}
