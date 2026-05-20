export type RepMelStatus = "active" | "inactive" | "training" | "unknown";
export type RepTrainingStatus = "certified" | "in_training" | "needs_training" | "unknown";

export type ActiveRep = {
  repId: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  active: boolean;
  skills: string[];
  travelRadius: number;
  lastProjectDate: string | null;
  completionRate: number;
  noShowRate: number;
  dmOwner: string;
  melStatus: RepMelStatus;
  trainingStatus: RepTrainingStatus;
  openAssignments: number;
  completedAssignments: number;
};

export type RepFitLevel = "strong" | "good" | "stretch" | "poor";
export type RepRiskLevel = "low" | "medium" | "high";

export type RepOpportunityMatch = {
  matchScore: number;
  fitLevel: RepFitLevel;
  riskLevel: RepRiskLevel;
  recommendedAction: string;
  strengths: string[];
  concerns: string[];
  distanceMiles: number | null;
};

export type TerritoryCoverageHealth = "green" | "yellow" | "red";

export type CoverageGap = {
  territory: string;
  state: string;
  openProjects: number;
  activeReps: number;
  gapScore: number;
  health: TerritoryCoverageHealth;
  suggestedRep?: string;
};

export type RepIntelligenceSnapshot = {
  fetchedAt: string;
  activeReps: ActiveRep[];
  territoryStaffingScore: number;
  coverageGaps: CoverageGap[];
  highRiskProjects: Array<{
    projectName: string;
    client: string;
    state: string;
    riskScore: number;
    fillProbability: number;
    bestRepName: string | null;
  }>;
  bestRepPerProject: Array<{
    projectName: string;
    client: string;
    repName: string;
    repId: string;
    matchScore: number;
    distanceMiles: number | null;
  }>;
  nearbyActiveReps: Array<{
    repName: string;
    repId: string;
    state: string;
    openAssignments: number;
    utilizationPercent: number;
  }>;
  unstaffedOpportunities: Array<{
    projectName: string;
    client: string;
    storeName: string;
    state: string;
    priority: string;
  }>;
  repUtilization: Array<{
    repId: string;
    repName: string;
    utilizationPercent: number;
    openAssignments: number;
  }>;
  repProjectMatches: RepProjectMatchRow[];
  staffingRecommendations: StaffingRecommendationRow[];
  geocodedRepCount: number;
  geocodedOpportunityCount: number;
  importedRepCount: number;
};

export type RepProjectMatchRow = {
  repId: string;
  repName: string;
  opportunityId: string;
  projectName: string;
  client: string;
  storeName: string;
  state: string;
  matchScore: number;
  fitLevel: string;
  riskLevel: string;
  distanceMiles: number | null;
  recommendedAction: string;
};

export type StaffingRecommendationRow = {
  id: string;
  priority: "critical" | "high" | "medium";
  title: string;
  summary: string;
  recommendedAction: string;
  projectName?: string;
  client?: string;
  repName?: string;
  distanceMiles?: number | null;
  matchScore?: number;
};
