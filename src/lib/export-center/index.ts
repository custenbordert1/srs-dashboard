export type ExportMetadataRow = {
  label: string;
  value: string;
};

export type ExportCsvOptions = {
  filename: string;
  headers: string[];
  rows: string[][];
  metadata?: ExportMetadataRow[];
  dataAsOf?: string;
};

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildExportCsv(options: ExportCsvOptions): string {
  const lines: string[] = [];
  const exportDate = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  lines.push(["Export Date", escapeCsvField(exportDate)].join(","));
  if (options.dataAsOf) {
    lines.push(["Data As Of", escapeCsvField(options.dataAsOf)].join(","));
  }
  if (options.metadata) {
    for (const row of options.metadata) {
      lines.push([row.label, escapeCsvField(row.value)].join(","));
    }
  }
  if (options.metadata?.length || options.dataAsOf) {
    lines.push("");
  }

  lines.push(options.headers.map(escapeCsvField).join(","));
  for (const row of options.rows) {
    lines.push(row.map((cell) => escapeCsvField(cell)).join(","));
  }
  return lines.join("\r\n");
}

export function downloadExportCsv(options: ExportCsvOptions): void {
  const csv = buildExportCsv(options);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = options.filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type ExportCenterDatasetId =
  | "candidates"
  | "projects"
  | "territories"
  | "recruiters"
  | "executive-actions";

export const EXPORT_CENTER_LABELS: Record<ExportCenterDatasetId, string> = {
  candidates: "Candidates",
  projects: "Projects",
  territories: "Territories",
  recruiters: "Recruiters",
  "executive-actions": "Executive Actions",
};
