/**
 * P186.3 feature flags — all default OFF.
 * No flag enables authoritative mode, paperwork send, continuous automation, or MEL export.
 */
export type P1863Flags = {
  operatorDashboard: boolean;
  approvalActions: boolean;
  bulkActions: boolean;
  missingShadowReviewQueue: boolean;
  redactedExports: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1863Flags(overrides?: Partial<P1863Flags>): P1863Flags {
  return {
    operatorDashboard: flag("P186_OPERATOR_DASHBOARD"),
    approvalActions: flag("P186_APPROVAL_ACTIONS"),
    bulkActions: flag("P186_BULK_ACTIONS"),
    missingShadowReviewQueue: flag("P186_MISSING_SHADOW_REVIEW_QUEUE"),
    redactedExports: flag("P186_REDACTED_EXPORTS"),
    ...overrides,
  };
}

export function readBulkLimit(): number {
  const n = Number(process.env.P186_BULK_BATCH_LIMIT ?? "25");
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.floor(n)) : 25;
}
