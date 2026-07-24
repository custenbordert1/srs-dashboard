export const P215_PHASE = "P215" as const;

/** Exactly one root cause per blocked candidate. */
export type P215RootCause =
  | "POSITION_LOCATION_PRESENT"
  | "POSITION_LOCATION_EMPTY"
  | "POSITION_LOOKUP_FAILED"
  | "POSITION_ID_MISSING"
  | "LEGITIMATE_NATIONAL_POSTING"
  | "LEGITIMATE_FLEXIBLE_POSTING"
  | "CANDIDATE_NOT_ATTACHED_TO_POSITION"
  | "UNKNOWN";

/** What P214 blocked the candidate for (its only posting-related blocker). */
export type P215P214Blocker = "NON_GEOGRAPHIC_POSTING" | "MISSING_JOB_LOCATION";

export type P215TitleKind = "geo_titled" | "flexible" | "national" | "generic";

export type P215RootCauseEvidence = {
  /** Candidate is attached to a position (an applied-position link exists). */
  attachedToPosition: boolean;
  /** The link carries a usable position id. */
  hasPositionId: boolean;
  /** Lookup attempted and API call succeeded (found or explicit 404). */
  lookupSucceeded: boolean;
  /** Position object exists in Breezy. */
  positionFound: boolean;
  /** Position.Location city, when the position resolved. */
  locationCity: string;
  /** Position.Location US state code, when the position resolved. */
  locationState: string;
  /** Kind derived from the position title. */
  titleKind: P215TitleKind;
};

export type P215Comparison = {
  p214Correct: boolean;
  explanation: string;
};

export type P215PositionMetadataSummary = {
  totalPositions: number;
  withValidLocation: number;
  withoutLocation: number;
  flexiblePostings: number;
  nationalPostings: number;
  missingCity: number;
  missingState: number;
};
