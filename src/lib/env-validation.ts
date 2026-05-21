import { loadConfigSync } from "@/lib/config";

export type { BreezyFailureKind } from "@/lib/breezy-error-ui";
export { classifyBreezyError } from "@/lib/breezy-error-ui";

export type EnvVarGroup =
  | "auth"
  | "breezy"
  | "recruiting_sheet"
  | "mel"
  | "hellosign"
  | "geocoding"
  | "feature_flags";

/** Platform areas that depend on specific env vars (for startup logs and restoration). */
export type EnvFeature =
  | "login_auth"
  | "breezy_jobs"
  | "breezy_candidates"
  | "recruiting_intelligence"
  | "mel_projects"
  | "recruiting_sheet_archive"
  | "hellosign"
  | "geocoding";

export type EnvVarDefinition = {
  name: string;
  group: EnvVarGroup;
  required: boolean;
  description: string;
  example: string;
  usedBy: EnvFeature[];
  /** When true, empty or placeholder values count as missing. */
  rejectPlaceholders?: boolean;
};

export type EnvVarStatus = {
  name: string;
  group: EnvVarGroup;
  configured: boolean;
  required: boolean;
  description: string;
};

export type EnvValidationReport = {
  ok: boolean;
  missingRequired: EnvVarStatus[];
  optionalUnset: EnvVarStatus[];
  statuses: EnvVarStatus[];
  setupHint: string;
};

const PLACEHOLDER_PATTERNS = [
  /^your[-_]/i,
  /^placeholder$/i,
  /^changeme$/i,
  /^replace[-_]?me$/i,
  /^generate[-_]?a/i,
  /^xxx+$/i,
];

export const FEATURE_ENV_REQUIREMENTS: Record<
  EnvFeature,
  { label: string; requiredVars: string[]; optionalVars?: string[] }
> = {
  login_auth: {
    label: "Login / auth",
    requiredVars: ["SESSION_SECRET or BREEZY_API_KEY"],
    optionalVars: ["DM_DEFAULT_PASSWORD"],
  },
  breezy_jobs: {
    label: "Breezy jobs",
    requiredVars: ["BREEZY_API_KEY"],
    optionalVars: ["BREEZY_COMPANY_ID"],
  },
  breezy_candidates: {
    label: "Breezy candidates",
    requiredVars: ["BREEZY_API_KEY"],
    optionalVars: ["BREEZY_COMPANY_ID", "BREEZY_ADDED_DATE_TIMEZONE"],
  },
  recruiting_intelligence: {
    label: "Recruiting intelligence",
    requiredVars: ["BREEZY_API_KEY"],
    optionalVars: ["BREEZY_COMPANY_ID", "BREEZY_ADDED_DATE_TIMEZONE"],
  },
  mel_projects: {
    label: "MEL projects",
    requiredVars: ["GOOGLE_MEL_PROJECTS_SHEET_ID"],
    optionalVars: ["GOOGLE_MEL_PROJECTS_SHEET_GID"],
  },
  recruiting_sheet_archive: {
    label: "Recruiting sheet (archive)",
    requiredVars: [],
    optionalVars: ["GOOGLE_SHEET_ID", "GOOGLE_SHEET_GID"],
  },
  hellosign: {
    label: "HelloSign offer packets",
    requiredVars: [],
    optionalVars: ["HELLOSIGN_API_KEY"],
  },
  geocoding: {
    label: "Geocoding",
    requiredVars: [],
    optionalVars: ["GEOCODING_ENABLED"],
  },
};

export const ENV_VAR_DEFINITIONS: EnvVarDefinition[] = [
  {
    name: "SESSION_SECRET",
    group: "auth",
    required: false,
    description:
      "Signs login session cookies. Required in production. In development, BREEZY_API_KEY can substitute.",
    example: "generate-a-long-random-string",
    usedBy: ["login_auth"],
    rejectPlaceholders: true,
  },
  {
    name: "BREEZY_API_KEY",
    group: "breezy",
    required: true,
    description: "Breezy HR API token for live jobs, candidates, and recruiting KPIs.",
    example: "your-breezy-api-token",
    usedBy: ["login_auth", "breezy_jobs", "breezy_candidates", "recruiting_intelligence"],
    rejectPlaceholders: true,
  },
  {
    name: "BREEZY_COMPANY_ID",
    group: "breezy",
    required: false,
    description: "Optional Breezy company id when auto-discovery is not used.",
    example: "",
    usedBy: ["breezy_jobs", "breezy_candidates", "recruiting_intelligence"],
  },
  {
    name: "BREEZY_ADDED_DATE_TIMEZONE",
    group: "breezy",
    required: false,
    description: "IANA timezone for Added Date filters (defaults to America/Chicago).",
    example: "America/Chicago",
    usedBy: ["breezy_candidates", "recruiting_intelligence"],
  },
  {
    name: "BREEZY_SYNC_MAX_REQUESTS_PER_MINUTE",
    group: "breezy",
    required: false,
    description: "Optional rate limit override for Breezy sync diagnostics.",
    example: "40",
    usedBy: ["breezy_candidates"],
  },
  {
    name: "GOOGLE_SHEET_ID",
    group: "recruiting_sheet",
    required: false,
    description: "Archive/reference recruiting Google Sheet id (not live KPI source).",
    example: "your-google-sheet-id",
    usedBy: ["recruiting_sheet_archive"],
    rejectPlaceholders: true,
  },
  {
    name: "GOOGLE_SHEET_GID",
    group: "recruiting_sheet",
    required: false,
    description: "Tab gid for the recruiting archive sheet (defaults to 0).",
    example: "0",
    usedBy: ["recruiting_sheet_archive"],
  },
  {
    name: "RECRUITING_SHEET_LIVE_SOURCE",
    group: "feature_flags",
    required: false,
    description: "Legacy flag — set true only to compare sheet vs Breezy (not recommended).",
    example: "false",
    usedBy: ["recruiting_sheet_archive"],
  },
  {
    name: "NEXT_PUBLIC_RECRUITING_SHEET_LIVE_SOURCE",
    group: "feature_flags",
    required: false,
    description: "Client-visible legacy sheet live flag (keep false for Breezy-primary).",
    example: "false",
    usedBy: ["recruiting_sheet_archive"],
  },
  {
    name: "GOOGLE_MEL_PROJECTS_SHEET_ID",
    group: "mel",
    required: true,
    description: "MEL projects Google Sheet id for workforce / coverage routes.",
    example: "your-mel-projects-sheet-id",
    usedBy: ["mel_projects"],
    rejectPlaceholders: true,
  },
  {
    name: "GOOGLE_MEL_PROJECTS_SHEET_GID",
    group: "mel",
    required: false,
    description: "Tab gid for the MEL projects sheet (defaults to 0).",
    example: "0",
    usedBy: ["mel_projects"],
  },
  {
    name: "HELLOSIGN_API_KEY",
    group: "hellosign",
    required: false,
    description: "Dropbox Sign (HelloSign) API key for offer packet routes.",
    example: "your-hellosign-api-key",
    usedBy: ["hellosign"],
    rejectPlaceholders: true,
  },
  {
    name: "GEOCODING_ENABLED",
    group: "geocoding",
    required: false,
    description: "Set to false to disable OpenStreetMap geocoding network calls.",
    example: "true",
    usedBy: ["geocoding"],
  },
  {
    name: "DM_DEFAULT_PASSWORD",
    group: "auth",
    required: false,
    description: "Deprecated shared password fallback — prefer per-user passwords in the UI.",
    example: "",
    usedBy: ["login_auth"],
  },
];

function readRawEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholderValue(value: string): boolean {
  if (!value) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function isBreezyApiKeyConfigured(): boolean {
  return Boolean(loadConfigSync().breezyApiKey);
}

function isSessionConfigured(): boolean {
  const sessionSecret = readRawEnv("SESSION_SECRET");
  if (sessionSecret && !isPlaceholderValue(sessionSecret)) return true;
  return isBreezyApiKeyConfigured();
}

function isEnvConfigured(def: EnvVarDefinition): boolean {
  const raw = readRawEnv(def.name);

  if (def.name === "BREEZY_API_KEY") {
    return isBreezyApiKeyConfigured();
  }

  if (def.name === "SESSION_SECRET") {
    return isSessionConfigured();
  }

  if (def.name === "GOOGLE_MEL_PROJECTS_SHEET_ID") {
    return raw.length > 0 && !isPlaceholderValue(raw);
  }

  if (!raw) {
    if (def.name === "GOOGLE_SHEET_ID") return true;
    if (def.name === "GOOGLE_SHEET_GID") return true;
    if (def.name === "GOOGLE_MEL_PROJECTS_SHEET_GID") return true;
    if (def.name === "BREEZY_ADDED_DATE_TIMEZONE") return true;
    if (def.name === "GEOCODING_ENABLED") return true;
    return false;
  }

  if (def.rejectPlaceholders && isPlaceholderValue(raw)) return false;
  return true;
}

export function getEnvVarStatuses(): EnvVarStatus[] {
  return ENV_VAR_DEFINITIONS.map((def) => ({
    name: def.name,
    group: def.group,
    configured: isEnvConfigured(def),
    required: def.required,
    description: def.description,
  }));
}

export function validateEnv(): EnvValidationReport {
  const statuses = getEnvVarStatuses();
  const missingRequired = statuses.filter((s) => s.required && !s.configured);
  const optionalUnset = statuses.filter((s) => !s.required && !s.configured);

  const setupHint =
    missingRequired.length > 0
      ? `Copy .env.local.example to .env.local and set: ${missingRequired.map((s) => s.name).join(", ")}. Then restart the dev server.`
      : "Core environment variables are configured.";

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    optionalUnset,
    statuses,
    setupHint,
  };
}

export function getFeatureReadiness(): { feature: EnvFeature; label: string; ready: boolean; missing: string[] }[] {
  const breezyReady = isBreezyApiKeyConfigured();
  const sessionReady = isSessionConfigured();
  const melDef = ENV_VAR_DEFINITIONS.find((d) => d.name === "GOOGLE_MEL_PROJECTS_SHEET_ID")!;
  const melReady = isEnvConfigured(melDef);

  return [
    {
      feature: "login_auth",
      label: FEATURE_ENV_REQUIREMENTS.login_auth.label,
      ready: sessionReady,
      missing: sessionReady ? [] : ["SESSION_SECRET or BREEZY_API_KEY"],
    },
    {
      feature: "breezy_jobs",
      label: FEATURE_ENV_REQUIREMENTS.breezy_jobs.label,
      ready: breezyReady,
      missing: breezyReady ? [] : ["BREEZY_API_KEY"],
    },
    {
      feature: "breezy_candidates",
      label: FEATURE_ENV_REQUIREMENTS.breezy_candidates.label,
      ready: breezyReady,
      missing: breezyReady ? [] : ["BREEZY_API_KEY"],
    },
    {
      feature: "recruiting_intelligence",
      label: FEATURE_ENV_REQUIREMENTS.recruiting_intelligence.label,
      ready: breezyReady,
      missing: breezyReady ? [] : ["BREEZY_API_KEY"],
    },
    {
      feature: "mel_projects",
      label: FEATURE_ENV_REQUIREMENTS.mel_projects.label,
      ready: melReady,
      missing: melReady ? [] : ["GOOGLE_MEL_PROJECTS_SHEET_ID"],
    },
  ];
}

export function logStartupEnvValidation(): void {
  const report = validateEnv();
  const features = getFeatureReadiness();
  const lines: string[] = [];

  if (report.ok) {
    console.info("[env] ✓ All required environment variables are configured.");
    console.info(
      "[env] Feature readiness:",
      Object.fromEntries(features.map((f) => [FEATURE_ENV_REQUIREMENTS[f.feature].label, "ready"])),
    );
    return;
  }

  lines.push("");
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push("[env] Development environment — missing variables");
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push("Paste these from your old Mac into .env.local, then restart npm run dev:");
  lines.push("");

  for (const status of report.missingRequired) {
    const def = ENV_VAR_DEFINITIONS.find((d) => d.name === status.name);
    const featuresForVar = def?.usedBy
      .map((f) => FEATURE_ENV_REQUIREMENTS[f].label)
      .join(", ");
    lines.push(`  ✗ ${status.name}`);
    lines.push(`      System: ${def?.group ?? status.group}`);
    if (featuresForVar) lines.push(`      Powers: ${featuresForVar}`);
    lines.push(`      ${status.description}`);
    lines.push("");
  }

  lines.push("Feature status:");
  for (const row of features) {
    const label = FEATURE_ENV_REQUIREMENTS[row.feature].label;
    if (row.ready) {
      lines.push(`  ✓ ${label}`);
    } else {
      lines.push(`  ✗ ${label} — needs: ${row.missing.join(", ")}`);
    }
  }

  lines.push("");
  lines.push(report.setupHint);
  lines.push("══════════════════════════════════════════════════════════════");
  lines.push("");

  console.error(lines.join("\n"));
}

export function breezyConfigErrorMessage(): string {
  return "Missing Breezy API key. Add BREEZY_API_KEY to .env.local and restart npm run dev.";
}

export function melConfigErrorMessage(): string {
  return "GOOGLE_MEL_PROJECTS_SHEET_ID is not set. Copy .env.local.example to .env.local, add the MEL sheet id, and restart the dev server.";
}

export function authConfigErrorMessage(): string {
  return "Server auth is not configured. Set SESSION_SECRET or BREEZY_API_KEY in .env.local and restart the dev server.";
}
