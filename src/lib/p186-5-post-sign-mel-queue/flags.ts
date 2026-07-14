/**
 * P186.5 feature flags — all default OFF.
 * No flag enables automatic MEL export, paperwork send, continuous automation,
 * or authoritative P186 mode.
 */
export type P1865Flags = {
  postSignObserver: boolean;
  onboardingChecklist: boolean;
  onboardingReviewActions: boolean;
  readyForMelReviewActions: boolean;
  melExportQueue: boolean;
  melExportPreview: boolean;
  reconciliation: boolean;
  postSignHealthDashboard: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1865Flags(overrides?: Partial<P1865Flags>): P1865Flags {
  return {
    postSignObserver: flag("P186_POST_SIGN_OBSERVER"),
    onboardingChecklist: flag("P186_ONBOARDING_CHECKLIST"),
    onboardingReviewActions: flag("P186_ONBOARDING_REVIEW_ACTIONS"),
    readyForMelReviewActions: flag("P186_READY_FOR_MEL_REVIEW_ACTIONS"),
    melExportQueue: flag("P186_MEL_EXPORT_QUEUE"),
    melExportPreview: flag("P186_MEL_EXPORT_PREVIEW"),
    reconciliation: flag("P186_POST_SIGN_RECONCILIATION"),
    postSignHealthDashboard: flag("P186_POST_SIGN_HEALTH_DASHBOARD"),
    ...overrides,
  };
}

export function readMissingDocsAgeThresholdMs(): number {
  const n = Number(process.env.P186_MISSING_DOCS_AGE_THRESHOLD_MS ?? String(3 * 86400000));
  return Number.isFinite(n) && n > 0 ? n : 3 * 86400000;
}
