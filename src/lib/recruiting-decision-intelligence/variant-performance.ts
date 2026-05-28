import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { candidatesForJob, daysSince, isHiredStage, isInterviewingStage } from "@/lib/dm-dashboard/territory-shared";
import type { JobDraft } from "@/lib/job-management/job-draft-types";
import { buildApplicantCountByBreezyJobId } from "@/lib/job-management/job-applicant-counts-core";
import type { VariantPerformanceRow } from "@/lib/recruiting-decision-intelligence/types";

const AGING_VARIANT_DAYS = 14;

function breezyIdForDraft(draft: JobDraft): string | null {
  return draft.breezyJobId ?? draft.clonedFromBreezyJobId ?? draft.variant?.sourceJobId ?? null;
}

function metricsForBreezyJob(
  breezyJobId: string,
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
): { applicants: number; interviews: number; hires: number } {
  const job = jobs.find((row) => row.jobId === breezyJobId);
  if (!job) {
    return { applicants: 0, interviews: 0, hires: 0 };
  }
  const jobCandidates = candidatesForJob(job, candidates);
  return {
    applicants: jobCandidates.length,
    interviews: jobCandidates.filter((c) => isInterviewingStage(c.stage)).length,
    hires: jobCandidates.filter((c) => isHiredStage(c.stage)).length,
  };
}

export function buildVariantPerformanceRows(
  drafts: JobDraft[],
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  referenceIso: string,
): VariantPerformanceRow[] {
  const variantDrafts = drafts.filter((draft) => draft.variant);
  if (variantDrafts.length === 0) return [];

  const applicantCounts = buildApplicantCountByBreezyJobId(
    candidates.map((c) => ({
      candidateId: c.candidateId,
      email: c.email,
      positionId: c.positionId,
      positionName: c.positionName,
    })),
    jobs.map((j) => ({ jobId: j.jobId, friendlyId: j.friendlyId, name: j.name })),
  );

  const reference = new Date(referenceIso);
  const rows: VariantPerformanceRow[] = variantDrafts.map((draft) => {
    const breezyId = breezyIdForDraft(draft);
    const pushedMetrics = breezyId ? metricsForBreezyJob(breezyId, jobs, candidates) : { applicants: 0, interviews: 0, hires: 0 };
    const applicants =
      breezyId && draft.status === "published"
        ? pushedMetrics.applicants
        : breezyId
          ? applicantCounts.get(breezyId) ?? 0
          : 0;
    const interviews = pushedMetrics.interviews;
    const hires = pushedMetrics.hires;
    const conversionPercent =
      applicants > 0 ? Math.round((hires / applicants) * 1000) / 10 : null;
    const ageDays = daysSince(draft.createdAt, reference) ?? 0;
    const published = draft.variant!.queueStatus === "published" || draft.status === "published";

    return {
      draftId: draft.id,
      variantGroupId: draft.variant!.variantGroupId,
      variantIndex: draft.variant!.variantIndex,
      sourceJobId: draft.variant!.sourceJobId,
      title: draft.title,
      cityTarget: draft.variant!.cityTarget,
      state: draft.usState,
      queueStatus: draft.variant!.queueStatus,
      published,
      applicants,
      interviews,
      hires,
      conversionPercent,
      ageDays,
      marker: null,
      warning: undefined,
    };
  });

  const byGroup = new Map<string, VariantPerformanceRow[]>();
  for (const row of rows) {
    const group = byGroup.get(row.variantGroupId) ?? [];
    group.push(row);
    byGroup.set(row.variantGroupId, group);
  }

  for (const group of byGroup.values()) {
    const scored = group.filter((row) => row.applicants > 0 || row.hires > 0);
    if (scored.length === 0) continue;
    const best = [...scored].sort((a, b) => {
      const hireDiff = b.hires - a.hires;
      if (hireDiff !== 0) return hireDiff;
      return b.applicants - a.applicants;
    })[0];
    const weakest = [...scored].sort((a, b) => a.applicants - b.applicants)[0];
    if (best) best.marker = "best";
    if (weakest && weakest.draftId !== best?.draftId) weakest.marker = "weakest";
  }

  for (const row of rows) {
    if (row.queueStatus === "pending" && row.ageDays >= AGING_VARIANT_DAYS) {
      row.marker = row.marker ?? "aging";
      row.warning = `Pending variant aging ${row.ageDays}d — review before publish.`;
    }
  }

  return rows.sort((a, b) => b.applicants - a.applicants || b.ageDays - a.ageDays);
}
