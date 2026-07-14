/**
 * P186.2 feature flags — all default OFF unless explicitly enabled.
 * No flag enables authoritative mode.
 */
export type P1862Flags = {
  shadowIngestion: boolean;
  adapterBreezy: boolean;
  adapterRecruiter: boolean;
  adapterOperator: boolean;
  adapterPaperwork: boolean;
  adapterDropbox: boolean;
  adapterOnboarding: boolean;
  adapterMel: boolean;
  adapterReconcile: boolean;
  reconciliation: boolean;
  shadowHealthReporting: boolean;
};

function flag(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw == null || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readP1862Flags(overrides?: Partial<P1862Flags>): P1862Flags {
  const base: P1862Flags = {
    shadowIngestion: flag("P186_SHADOW_INGESTION"),
    adapterBreezy: flag("P186_ADAPTER_BREEZY"),
    adapterRecruiter: flag("P186_ADAPTER_RECRUITER"),
    adapterOperator: flag("P186_ADAPTER_OPERATOR"),
    adapterPaperwork: flag("P186_ADAPTER_PAPERWORK"),
    adapterDropbox: flag("P186_ADAPTER_DROPBOX"),
    adapterOnboarding: flag("P186_ADAPTER_ONBOARDING"),
    adapterMel: flag("P186_ADAPTER_MEL"),
    adapterReconcile: flag("P186_ADAPTER_RECONCILE"),
    reconciliation: flag("P186_RECONCILIATION"),
    shadowHealthReporting: flag("P186_SHADOW_HEALTH_REPORTING"),
  };
  return { ...base, ...overrides };
}

export function isAdapterEnabled(
  flags: P1862Flags,
  source:
    | "breezy"
    | "recruiter"
    | "operator"
    | "p184"
    | "p185"
    | "dropbox_sign"
    | "onboarding"
    | "mel"
    | "reconcile"
    | "workflow_store"
    | "synthetic",
): boolean {
  if (!flags.shadowIngestion && source !== "synthetic") return false;
  switch (source) {
    case "breezy":
      return flags.adapterBreezy;
    case "recruiter":
      return flags.adapterRecruiter;
    case "operator":
      return flags.adapterOperator;
    case "p184":
    case "p185":
      return flags.adapterPaperwork;
    case "dropbox_sign":
      return flags.adapterDropbox;
    case "onboarding":
      return flags.adapterOnboarding;
    case "mel":
      return flags.adapterMel;
    case "reconcile":
      return flags.adapterReconcile;
    case "workflow_store":
      // workflow dual-write observe uses shadow ingestion + any domain adapter overlap
      return flags.shadowIngestion;
    case "synthetic":
      return true;
    default:
      return false;
  }
}
