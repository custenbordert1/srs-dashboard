import type { BreezyJobLocationSource } from "@/lib/breezy-job-location";
import { isAuthoritativeBreezyLocationSource } from "@/lib/p216-position-location-authority/resolve";

export type P216TitleParsingOccurrence = {
  file: string;
  function: string;
  role: "diagnostic_only" | "must_not_drive_geography" | "fixed_in_p216";
  notes: string;
};

/**
 * Static inventory of title-parsing call sites after P216.
 * Production geography gates must not consume job_name as authoritative.
 */
export const P216_TITLE_PARSING_INVENTORY: P216TitleParsingOccurrence[] = [
  {
    file: "src/lib/breezy-job-location.ts",
    function: "normalizeBreezyJobLocation (job_name fallback)",
    role: "diagnostic_only",
    notes:
      "P216: title parse only sets locationSource='job_name'; it no longer populates city/state. Authoritative geography requires Position.Location (or other non-title sources).",
  },
  {
    file: "src/lib/breezy-job-location.ts",
    function: "parseLocationFromJobName",
    role: "diagnostic_only",
    notes: "Parser retained for diagnostics and drift detection. Never for coverage/DM/eligibility.",
  },
  {
    file: "scripts/p214-run-unsent-test-batch.ts",
    function: "phasePreview",
    role: "fixed_in_p216",
    notes: "Now resolves Applied Position via fetchBreezyPositionById and uses Position.Location only.",
  },
  {
    file: "scripts/p209-run-coverage-audit.ts",
    function: "main",
    role: "fixed_in_p216",
    notes: "Uses authoritative posting geography; title parse no longer fills jobCity/jobState for gates.",
  },
  {
    file: "src/lib/p210-recruiting-intelligence/posting-quality.ts",
    function: "buildPostingQuality",
    role: "fixed_in_p216",
    notes: "Title parse no longer backfills city/state used for flexible/national geography judgments.",
  },
  {
    file: "src/lib/breezy-job-status-reconciliation/build-job-status-reconciliation.ts",
    function: "inferJobFromCandidates",
    role: "fixed_in_p216",
    notes: "No longer invents city/state from position title when live Position.Location is unavailable.",
  },
  {
    file: "src/lib/breezy-job-publish-review/build-job-publish-review.ts",
    function: "inferJobFromCandidates",
    role: "fixed_in_p216",
    notes: "No longer invents city/state from position title when live Position.Location is unavailable.",
  },
];

export function remainingTitleParsingForGeography(): P216TitleParsingOccurrence[] {
  return P216_TITLE_PARSING_INVENTORY.filter((o) => o.role === "must_not_drive_geography");
}

export function countAuthoritativeJobs(
  jobs: Array<{ city: string; state: string; locationSource?: string }>,
): { total: number; authoritative: number; titleOnly: number; missing: number } {
  let authoritative = 0;
  let titleOnly = 0;
  let missing = 0;
  for (const j of jobs) {
    const source = (j.locationSource ?? "missing") as BreezyJobLocationSource;
    if (isAuthoritativeBreezyLocationSource(source) && j.city.trim() && j.state.trim()) {
      authoritative += 1;
    } else if (source === "job_name") {
      titleOnly += 1;
    } else {
      missing += 1;
    }
  }
  return { total: jobs.length, authoritative, titleOnly, missing };
}
