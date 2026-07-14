/**
 * P188.4 flags — restore execution defaults OFF.
 */
export type P1884Flags = {
  ownershipDashboard: boolean;
  restorePreview: boolean;
  /** Never auto-enable. Requires explicit operator authorization. */
  restoreExecution: boolean;
  ownershipLedgerWrite: boolean;
};

function flag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1884Flags(overrides?: Partial<P1884Flags>): P1884Flags {
  return {
    ownershipDashboard: flag("P188_OWNERSHIP_DASHBOARD"),
    restorePreview: flag("P188_OWNERSHIP_RESTORE_PREVIEW") || true, // preview always available
    restoreExecution: flag("P188_OWNERSHIP_RESTORE_EXECUTION"),
    ownershipLedgerWrite: flag("P188_OWNERSHIP_LEDGER_WRITE") || true, // ledger appends on real ownership changes when wired
    ...overrides,
  };
}
