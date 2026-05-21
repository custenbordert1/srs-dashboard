export type CandidateMatchLevel = "high" | "medium" | "low" | "no_resume";

export type CandidateSkillTagId =
  | "resets"
  | "planograms"
  | "audits"
  | "inventory"
  | "walmart"
  | "target"
  | "grocery"
  | "fixture_installation"
  | "retail_merchandising"
  | "overnight_travel"
  | "travel_willing"
  | "cpg"
  | "osa_scanning";

export type CandidateMatchFactors = {
  experience: number;
  travelRadius: number;
  responseSpeed: number;
  resumeQuality: number;
};

export type CandidateIntelligenceScore = {
  matchPercent: number;
  matchLevel: CandidateMatchLevel;
  isTopMatch: boolean;
  skillTags: CandidateSkillTagId[];
  skillTagLabels: string[];
  hasResume: boolean;
  factors: CandidateMatchFactors;
  distanceMiles: number | null;
  resumeKeywordCount: number;
  summary: string;
  scoringNotes: string[];
};

export type CandidateIntelligenceJobContext = {
  city: string;
  state: string;
  zip?: string;
};

export type CandidateIntelligenceContext = {
  referenceIso?: string;
  job?: CandidateIntelligenceJobContext;
  territoryStates?: string[];
};
