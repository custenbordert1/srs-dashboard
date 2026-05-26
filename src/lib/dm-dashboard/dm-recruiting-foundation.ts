import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { AuthSession } from "@/lib/auth/types";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";
import { candidateDisplayName, candidatesForJob } from "@/lib/dm-dashboard/territory-shared";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";

export type DmRecruitingFoundationSection =
  | "summary"
  | "jobs"
  | "candidates"
  | "stores"
  | "coverage";

export type DmTerritoryJobRow = {
  jobId: string;
  title: string;
  city: string;
  state: string;
  status: string;
  applicantCount: number;
  createdDate: string;
};

export type DmTerritoryCandidateRow = {
  candidateId: string;
  name: string;
  positionName: string;
  stage: string;
  source: string;
  city: string;
  state: string;
  appliedDate: string;
};

export type DmOpenStorePlaceholder = {
  storeKey: string;
  client: string;
  city: string;
  state: string;
  openStatus: boolean;
  assignedRep: string | null;
  note: string;
};

export type DmCoverageAnalyticsPlaceholder = {
  openJobs: number;
  candidatesLast7Days: number;
  zeroApplicantJobs: number;
  interviewingCount: number;
  coverageScore: number | null;
  note: string;
};

export type DmRecruitingFoundationPayload = {
  dmName: string;
  territoryStates: string[];
  territoryLabel: string;
  fetchedAt: string;
  breezyFetchedAt: string;
  partialCandidateSync: boolean;
  summary: {
    activeJobs: number;
    candidates: number;
    openMelStores: number;
    coverageScore: number | null;
  };
  jobs: DmTerritoryJobRow[];
  candidates: DmTerritoryCandidateRow[];
  openStores: DmOpenStorePlaceholder[];
  coverage: DmCoverageAnalyticsPlaceholder;
};

function territoryLabel(states: string[]): string {
  if (states.length === 0) return "Unassigned territory";
  if (states.length <= 4) return states.join(", ");
  return `${states.slice(0, 3).join(", ")} +${states.length - 3}`;
}

function isInterviewingStage(stage: string): boolean {
  const normalized = stage.toLowerCase();
  return (
    normalized.includes("interview") ||
    normalized.includes("screen") ||
    normalized.includes("qualified") ||
    normalized.includes("review")
  );
}

function buildOpenStorePlaceholders(opportunities: MelOpportunity[]): DmOpenStorePlaceholder[] {
  return opportunities
    .filter((row) => row.openStatus)
    .slice(0, 50)
    .map((row) => ({
      storeKey: row.opportunityId,
      client: row.client,
      city: row.city,
      state: row.state,
      openStatus: row.openStatus,
      assignedRep: row.isStaffed ? "Staffed" : null,
      note: "MEL demand row — staffing coverage placeholder for DM automation.",
    }));
}

export function buildDmRecruitingFoundation(
  session: AuthSession,
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  breezyFetchedAt: string,
  options: {
    partialCandidateSync?: boolean;
    melOpportunities?: MelOpportunity[];
    sections?: DmRecruitingFoundationSection[];
  } = {},
): DmRecruitingFoundationPayload {
  const territoryStates = getAssignedStatesForDm(session.dmName ?? session.email);
  const scopedJobs = applyTerritoryToJobs(session, jobs);
  const scopedCandidates = applyTerritoryToCandidates(session, candidates);
  const melOpportunities = options.melOpportunities ?? [];
  const openMel = melOpportunities.filter((o) => o.openStatus);

  const jobRows: DmTerritoryJobRow[] = scopedJobs.map((job) => ({
    jobId: job.jobId,
    title: job.name,
    city: job.city,
    state: job.state,
    status: job.status || "published",
    applicantCount: job.candidateCount ?? candidatesForJob(job, scopedCandidates).length,
    createdDate: job.createdDate,
  }));

  const candidateRows: DmTerritoryCandidateRow[] = scopedCandidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    name: candidateDisplayName(candidate),
    positionName: candidate.positionName,
    stage: candidate.stage,
    source: candidate.source,
    city: candidate.city,
    state: candidate.state,
    appliedDate: candidate.appliedDate,
  }));

  const zeroApplicantJobs = jobRows.filter((job) => job.applicantCount === 0).length;
  const interviewingCount = scopedCandidates.filter((c) => isInterviewingStage(c.stage)).length;

  const coverage: DmCoverageAnalyticsPlaceholder = {
    openJobs: jobRows.length,
    candidatesLast7Days: scopedCandidates.length,
    zeroApplicantJobs,
    interviewingCount,
    coverageScore: null,
    note: "Coverage score automation pending — uses Breezy jobs + candidates with MEL open-store context.",
  };

  const payload: DmRecruitingFoundationPayload = {
    dmName: session.dmName ?? session.email,
    territoryStates,
    territoryLabel: territoryLabel(territoryStates),
    fetchedAt: new Date().toISOString(),
    breezyFetchedAt,
    partialCandidateSync: options.partialCandidateSync ?? false,
    summary: {
      activeJobs: jobRows.length,
      candidates: candidateRows.length,
      openMelStores: openMel.length,
      coverageScore: null,
    },
    jobs: jobRows,
    candidates: candidateRows,
    openStores: buildOpenStorePlaceholders(melOpportunities),
    coverage,
  };

  const sections = options.sections;
  if (!sections || sections.length === 0) return payload;

  if (!sections.includes("jobs")) payload.jobs = [];
  if (!sections.includes("candidates")) payload.candidates = [];
  if (!sections.includes("stores")) payload.openStores = [];
  if (!sections.includes("coverage") && !sections.includes("summary")) {
    payload.coverage = {
      ...coverage,
      note: "Coverage section omitted by request.",
    };
  }

  return payload;
}
