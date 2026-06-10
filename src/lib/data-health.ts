import type { BreezyCandidatesHealthProbe, BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { buildBreezyAtsMetrics, formatBreezyAtsStatusDetails } from "@/lib/breezy-ats-metrics";
import { buildBreezyJobLocationDiagnostics } from "@/lib/breezy-job-location";
import type { SheetDataResult, SheetRow } from "@/lib/google-sheet-csv";
import { resolveMelProjectColumnKeys } from "@/lib/mel-projects-metrics";
import { resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";

export type DataHealthEndpointId =
  | "recruiting-sheet"
  | "mel-projects"
  | "breezy-jobs"
  | "breezy-candidates";

export type DataHealthSource = "sheet" | "breezy";

export type DataHealthReport = {
  id: DataHealthEndpointId;
  label: string;
  apiPath: string;
  source: DataHealthSource;
  status: "connected" | "error";
  rowCount: number;
  columnCount: number;
  fetchedAt: string;
  csvUrl?: string;
  metaLine?: string;
  firstFiveColumns: string[];
  sampleRowPreview: Array<{ column: string; value: string }>;
  warnings: string[];
};

const BREEZY_JOB_REQUIRED_FIELDS = ["jobId", "name", "city", "state"] as const;
const BREEZY_JOB_PREVIEW_FIELDS = [
  "name",
  "city",
  "state",
  "displayLocation",
  "locationSource",
] as const;
const BREEZY_CANDIDATE_REQUIRED_FIELDS = ["_id", "name"] as const;

const PREVIEW_VALUE_MAX = 96;

function truncate(value: string, max = PREVIEW_VALUE_MAX): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function buildSampleRowPreview(headers: string[], row: SheetRow | undefined): Array<{ column: string; value: string }> {
  const columns = headers.slice(0, 5);
  if (!row) {
    return columns.map((column) => ({ column, value: "—" }));
  }
  return columns.map((column) => ({
    column,
    value: truncate(row[column] ?? "") || "—",
  }));
}

function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return truncate(value) || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("name" in obj && typeof obj.name === "string") return truncate(obj.name);
    try {
      return truncate(JSON.stringify(value));
    } catch {
      return "—";
    }
  }
  return "—";
}

function buildObjectPreview(
  record: Record<string, unknown> | undefined,
  fieldKeys: string[],
): Array<{ column: string; value: string }> {
  const columns = fieldKeys.slice(0, 5);
  if (!record) {
    return columns.map((column) => ({ column, value: "—" }));
  }
  return columns.map((column) => ({
    column,
    value: previewValue(record[column]),
  }));
}

function objectFieldKeys(record: Record<string, unknown> | undefined): string[] {
  if (!record) return [];
  return Object.keys(record);
}

function missingObjectFields(
  record: Record<string, unknown> | undefined,
  required: readonly string[],
): string[] {
  if (!record) return [...required];
  return required.filter((field) => {
    const value = record[field];
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    return false;
  });
}

function baseSheetReport(
  id: DataHealthEndpointId,
  label: string,
  apiPath: string,
  data: SheetDataResult,
  missingRequired: string[],
): DataHealthReport {
  const warnings: string[] = [];

  if (!data.ok) {
    warnings.push(`API error: ${data.error}`);
    return {
      id,
      label,
      apiPath,
      source: "sheet",
      status: "error",
      rowCount: 0,
      columnCount: 0,
      fetchedAt: data.fetchedAt,
      csvUrl: data.csvUrl,
      firstFiveColumns: [],
      sampleRowPreview: [],
      warnings,
    };
  }

  const rowCount = data.rows.length;
  const columnCount = data.headers.length;
  const firstFiveColumns = data.headers.slice(0, 5);
  const sampleRowPreview = buildSampleRowPreview(data.headers, data.rows[0]);

  if (rowCount === 0) {
    warnings.push("Row count is 0 — the sheet may be empty or the wrong tab is configured.");
  }

  if (missingRequired.length > 0) {
    warnings.push(`Missing required columns: ${missingRequired.join(", ")}`);
  }

  return {
    id,
    label,
    apiPath,
    source: "sheet",
    status: "connected",
    rowCount,
    columnCount,
    fetchedAt: data.fetchedAt,
    csvUrl: data.csvUrl,
    firstFiveColumns,
    sampleRowPreview,
    warnings,
  };
}

function baseBreezyReport(
  id: DataHealthEndpointId,
  label: string,
  apiPath: string,
  fetchedAt: string,
  rows: Record<string, unknown>[],
  missingRequired: string[],
  metaLine?: string,
  error?: string,
): DataHealthReport {
  const warnings: string[] = [];

  if (error) {
    warnings.push(`API error: ${error}`);
    return {
      id,
      label,
      apiPath,
      source: "breezy",
      status: "error",
      rowCount: 0,
      columnCount: 0,
      fetchedAt,
      metaLine,
      firstFiveColumns: [],
      sampleRowPreview: [],
      warnings,
    };
  }

  const rowCount = rows.length;
  const fieldKeys = objectFieldKeys(rows[0]);
  const columnCount = fieldKeys.length;
  const firstFiveColumns = fieldKeys.slice(0, 5);
  const sampleRowPreview = buildObjectPreview(rows[0], fieldKeys);

  if (rowCount === 0) {
    warnings.push("Record count is 0 — no jobs or candidates were returned.");
  }

  if (missingRequired.length > 0) {
    warnings.push(`Missing required fields on first record: ${missingRequired.join(", ")}`);
  }

  return {
    id,
    label,
    apiPath,
    source: "breezy",
    status: "connected",
    rowCount,
    columnCount,
    fetchedAt,
    metaLine,
    firstFiveColumns,
    sampleRowPreview,
    warnings,
  };
}

export function analyzeRecruitingSheetHealth(data: SheetDataResult): DataHealthReport {
  const missingRequired = data.ok ? resolveKpiSheetColumnKeys(data.headers).missingForKpis : [];
  const report = baseSheetReport(
    "recruiting-sheet",
    "Recruiting sheet (archive)",
    "/api/recruiting-sheet",
    data,
    missingRequired,
  );
  return {
    ...report,
    warnings: [
      ...report.warnings,
      "Reference/export only — live recruiting KPIs use Breezy HR, not this sheet.",
    ],
  };
}

export function analyzeMelProjectsHealth(data: SheetDataResult): DataHealthReport {
  const missingRequired = data.ok ? resolveMelProjectColumnKeys(data.headers).missingColumns : [];
  return baseSheetReport("mel-projects", "MEL projects", "/api/mel-projects", data, missingRequired);
}

export function analyzeBreezyJobsHealth(data: BreezyJobsResult): DataHealthReport {
  if (!data.ok) {
    return baseBreezyReport(
      "breezy-jobs",
      "Breezy jobs",
      "/api/breezy/jobs",
      data.fetchedAt,
      [],
      [],
      undefined,
      data.error,
    );
  }

  const rows = data.jobs as Record<string, unknown>[];
  const missingRequired = missingObjectFields(rows[0], BREEZY_JOB_REQUIRED_FIELDS);
  const locationDiagnostics =
    data.locationDiagnostics ?? buildBreezyJobLocationDiagnostics(data.jobs);
  const metaLine = [
    data.companyName ? `Company: ${data.companyName}` : null,
    `Company ID: ${data.companyId}`,
    `Pipeline filter: ${data.state}`,
    `Missing city/state: ${locationDiagnostics.missingLocationCount}/${locationDiagnostics.totalJobs}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const report = baseBreezyReport(
    "breezy-jobs",
    "Breezy jobs",
    "/api/breezy/jobs",
    data.fetchedAt,
    rows,
    missingRequired,
    metaLine,
  );

  const sampleRowPreview = buildObjectPreview(rows[0], [...BREEZY_JOB_PREVIEW_FIELDS]);
  const warnings = [...report.warnings];
  if (locationDiagnostics.missingLocationCount > 0) {
    warnings.push(
      `${locationDiagnostics.missingLocationCount} job(s) missing normalized city or state — check Breezy location fields or job title.`,
    );
  }
  const topSource = Object.entries(locationDiagnostics.bySource).sort((a, b) => b[1] - a[1])[0];
  if (topSource) {
    warnings.push(`Primary location source: ${topSource[0]} (${topSource[1]} jobs).`);
  }

  return {
    ...report,
    firstFiveColumns: [...BREEZY_JOB_PREVIEW_FIELDS],
    sampleRowPreview,
    warnings,
  };
}

export function analyzeBreezyCandidatesHealth(
  data: BreezyCandidatesResult | BreezyCandidatesHealthProbe,
): DataHealthReport {
  if (!data.ok) {
    return baseBreezyReport(
      "breezy-candidates",
      "Breezy candidates",
      "/api/breezy/candidates/health",
      data.fetchedAt,
      [],
      [],
      undefined,
      data.error,
    );
  }

  const probe = data as BreezyCandidatesHealthProbe;
  const rows = data.candidates as Record<string, unknown>[];
  const missingRequired = missingObjectFields(rows[0], BREEZY_CANDIDATE_REQUIRED_FIELDS);
  const atsMetrics = buildBreezyAtsMetrics(data);
  const atsDetailLines = formatBreezyAtsStatusDetails(atsMetrics);
  const metaParts = [
    data.companyName ? `Company: ${data.companyName}` : null,
    `Company ID: ${data.companyId}`,
    data.positionId ? `Position: ${data.positionId}` : null,
    probe.fromCache
      ? `Source: warmed cache (${data.scanMode ?? "unknown"} tier${data.partial ? ", partial" : ""})`
      : null,
    probe.partial && !probe.fromCache ? "Source: cache cold (health probe only)" : null,
    ...atsDetailLines,
  ].filter(Boolean);

  const report = baseBreezyReport(
    "breezy-candidates",
    "Breezy candidates",
    "/api/breezy/candidates/health",
    data.fetchedAt,
    rows,
    missingRequired,
    metaParts.join(" · "),
  );

  const extraWarnings = [...(data.warnings ?? [])];
  if (probe.partial && !probe.fromCache) {
    extraWarnings.push(
      "Candidate cache cold — record count is 0 until Candidates or Command Center warms Breezy sync.",
    );
  } else if (probe.partial && rows.length > 0) {
    extraWarnings.push(
      `Partial Breezy sync (${atsMetrics.positionsScanned}/${atsMetrics.totalPositionsAvailable} positions scanned, ${atsMetrics.candidatesLoaded} candidates loaded) — open Candidates tab for full hydration.`,
    );
  } else if (atsMetrics.partialSync && rows.length > 0) {
    extraWarnings.push(
      `${atsMetrics.positionsNotScanned.toLocaleString()} published position(s) not scanned — candidate totals may be lower than Breezy until scan completes.`,
    );
  }

  return {
    ...report,
    warnings: [...report.warnings, ...extraWarnings],
  };
}
