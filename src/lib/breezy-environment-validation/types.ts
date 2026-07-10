export const P92_1_SOURCE_PHASE = "P92.1";
export const P92_1_PREVIEW_MODE = true as const;

export type BreezyEnvVarCheck = {
  name: string;
  required: boolean;
  configured: boolean;
  issue: string | null;
};

export type BreezyEndpointProbe = {
  endpoint: string;
  description: string;
  success: boolean;
  httpStatus: number | null;
  error: string | null;
  permissionDenied: boolean;
};

export type BreezyLiveFetchCheck = {
  kind: "job" | "candidate" | "p91_position";
  id: string;
  positionId?: string;
  success: boolean;
  error: string | null;
  summary: string | null;
};

export type BreezyEnvironmentValidationReport = {
  sourcePhase: typeof P92_1_SOURCE_PHASE;
  previewMode: typeof P92_1_PREVIEW_MODE;
  generatedAt: string;
  authentication: {
    status: "success" | "failed" | "not_attempted";
    companyId: string | null;
    companyName: string | null;
    error: string | null;
  };
  environmentVariables: BreezyEnvVarCheck[];
  missingRequired: string[];
  rateLimits: {
    clientMaxRequestsPerMinute: number;
    rateLimitHitDuringValidation: boolean;
    notes: string[];
  };
  permissions: {
    readCompanies: boolean;
    readPositionsList: boolean;
    readPositionById: boolean;
    readCandidateById: boolean;
    missingScopes: string[];
    unavailableEndpoints: string[];
  };
  endpointProbes: BreezyEndpointProbe[];
  liveFetches: BreezyLiveFetchCheck[];
  overallOk: boolean;
  failureReason: string | null;
  p92RerunTriggered: boolean;
  p92RerunSummary: {
    ran: boolean;
    jobsReviewed: number;
    candidatesUnlockedIfApproved: number;
    statusCounts: Record<string, number>;
    artifactPath: string | null;
    error: string | null;
  };
};
