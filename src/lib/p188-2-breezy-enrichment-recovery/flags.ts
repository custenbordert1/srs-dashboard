/**
 * P188.2 flags — all default OFF.
 * Preview/enrichment analysis may run in validation with forceFlags.
 * Production writes require separate explicit authorization (never default).
 */
export type P1882Flags = {
  enrichmentDashboard: boolean;
  enrichmentPreview: boolean;
  /** Never auto-enable. Writes require this + explicit operator authorization. */
  enrichmentWriteExecution: boolean;
  operatorReviewQueues: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1882Flags(overrides?: Partial<P1882Flags>): P1882Flags {
  return {
    enrichmentDashboard: flag("P188_ENRICHMENT_DASHBOARD"),
    enrichmentPreview: flag("P188_ENRICHMENT_PREVIEW"),
    enrichmentWriteExecution: flag("P188_ENRICHMENT_WRITE_EXECUTION"),
    operatorReviewQueues: flag("P188_OPERATOR_REVIEW_QUEUES"),
    ...overrides,
  };
}
