export const P170_SOURCE_PHASE = "P170" as const;

/** Where the resolved candidate was ultimately located. */
export type P170CandidateSource =
  | "ingestion_store"
  | "breezy_rescue"
  | "live_preview"
  | "cache";

export const P170_SOURCE_LABELS: Record<P170CandidateSource, string> = {
  ingestion_store: "Ingestion Store",
  breezy_rescue: "Breezy Rescue",
  live_preview: "Live Preview",
  cache: "Cache",
};

/** Structured search intent parsed from a raw recruiter query. */
export type P170SearchQuery = {
  raw: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  candidateId: string | null;
  positionId: string | null;
};

export type P170CandidateSummary = {
  candidateId: string;
  name: string;
  email: string | null;
  phone: string | null;
  positionId: string | null;
  positionName: string | null;
  appliedDate: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
};

/** The six-point Candidate Discovery Status checklist. */
export type P170DiscoveryStatus = {
  foundInBreezy: boolean;
  foundInIngestion: boolean;
  foundInSearch: boolean;
  evaluatedByP157: boolean;
  eligibleForP169: boolean;
  paperworkStatus: string;
  p157Action: string | null;
  p169Outcome: string | null;
};

export type P170SearchResult = {
  sourcePhase: typeof P170_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  query: P170SearchQuery;
  found: boolean;
  source: P170CandidateSource | null;
  rescueInvoked: boolean;
  rescueSource: string | null;
  hydratedIntoStore: boolean;
  candidate: P170CandidateSummary | null;
  discovery: P170DiscoveryStatus | null;
  warnings: string[];
};
