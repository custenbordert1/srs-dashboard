/**
 * P186.4 feature flags — all default OFF.
 * No authoritative-mode flag. No scheduler enablement. No writer disablement.
 */
export type P1864Flags = {
  writerInventoryReport: boolean;
  conflictDashboard: boolean;
  reconcilerExecution: boolean;
  schedulerCollisionAnalysis: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1864Flags(overrides?: Partial<P1864Flags>): P1864Flags {
  return {
    writerInventoryReport: flag("P186_WRITER_INVENTORY_REPORT"),
    conflictDashboard: flag("P186_CONFLICT_DASHBOARD"),
    reconcilerExecution: flag("P186_RECONCILER_EXECUTION"),
    schedulerCollisionAnalysis: flag("P186_SCHEDULER_COLLISION_ANALYSIS"),
    ...overrides,
  };
}
