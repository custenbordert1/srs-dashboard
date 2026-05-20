export type MatchLabel = "Strong Match" | "Good Match" | "Stretch Match" | "Outside Territory";

export type MelOpportunityPriority = "high" | "medium" | "low";

export type MelOpportunity = {
  opportunityId: string;
  projectName: string;
  client: string;
  storeAddress: string;
  storeName: string;
  city: string;
  state: string;
  projectType: string;
  priority: MelOpportunityPriority;
  openStatus: boolean;
  territoryOwner: string;
  storeCall: string;
  projectNo: string;
  isStaffed: boolean;
};

export type CandidateOpportunityMatch = {
  opportunityId: string;
  projectName: string;
  client: string;
  storeAddress: string;
  distanceMiles: number | null;
  fitPercent: number;
  matchLabel: MatchLabel;
  territory: string;
  priority: MelOpportunityPriority;
  summary: string;
};

export type CandidateMatchResult = {
  matches: CandidateOpportunityMatch[];
  aiSummary: string;
  travelRadiusMiles: number;
  opportunitiesConsidered: number;
};
