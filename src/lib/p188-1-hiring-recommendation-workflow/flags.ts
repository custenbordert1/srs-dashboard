/**
 * P188.1 feature flags — all default OFF.
 * No flag enables paperwork send, P187 authority, continuous automation, or MEL export.
 */
export type P1881Flags = {
  recommendationUi: boolean;
  recommendationApi: boolean;
  recruiterAssignmentRecovery: boolean;
  jobAssignmentRecovery: boolean;
  bulkRecommendationPreview: boolean;
  bulkRecommendationExecution: boolean;
  bypassFindingsDashboard: boolean;
  /** When on, mid-funnel onboarding reconcile will not advance Applied/Needs Review workflowStatus. */
  preventOnboardingMidfunnelBypass: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1881Flags(overrides?: Partial<P1881Flags>): P1881Flags {
  return {
    recommendationUi: flag("P188_RECOMMENDATION_UI"),
    recommendationApi: flag("P188_RECOMMENDATION_API"),
    recruiterAssignmentRecovery: flag("P188_RECRUITER_ASSIGNMENT_RECOVERY"),
    jobAssignmentRecovery: flag("P188_JOB_ASSIGNMENT_RECOVERY"),
    bulkRecommendationPreview: flag("P188_BULK_RECOMMENDATION_PREVIEW"),
    bulkRecommendationExecution: flag("P188_BULK_RECOMMENDATION_EXECUTION"),
    bypassFindingsDashboard: flag("P188_BYPASS_FINDINGS_DASHBOARD"),
    preventOnboardingMidfunnelBypass: flag("P188_PREVENT_ONBOARDING_MIDFUNNEL_BYPASS"),
    ...overrides,
  };
}
