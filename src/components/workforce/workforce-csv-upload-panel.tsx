"use client";

import { useCallback, useState } from "react";
import type { WorkforceImportStats, WorkforceCsvPreviewRow } from "@/lib/workforce-intelligence/workforce-csv-import";

type PreviewResponse = {
  ok: boolean;
  previewRows: WorkforceCsvPreviewRow[];
  stats: WorkforceImportStats;
  errors: Array<{ row: number; message: string }>;
  validRowCount: number;
  error?: string;
};

type WorkforceCsvUploadPanelProps = {
  onImportComplete: () => void;
};

export function WorkforceCsvUploadPanel({ onImportComplete }: WorkforceCsvUploadPanelProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const readFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setMessage("Only .csv files are accepted.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsvText(text);
      setPreview(null);
      setMessage(null);
    };
    reader.readAsText(file);
  }, []);

  async function runPreview() {
    if (!csvText) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workforce-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const parsed = (await res.json()) as PreviewResponse & { error?: string };
      setPreview(parsed);
      if (!parsed.ok && parsed.error) setMessage(parsed.error);
    } catch {
      setMessage("Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    if (!csvText) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workforce-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, action: "import", mode }),
      });
      const parsed = (await res.json()) as {
        ok?: boolean;
        error?: string;
        activeImported?: number;
        inactiveArchived?: number;
        terminatedArchived?: number;
        activeRosterCount?: number;
      };
      if (parsed.ok) {
        setMessage(
          `Active roster: ${parsed.activeImported ?? 0} · Inactive archived: ${parsed.inactiveArchived ?? 0} · Terminated archived: ${parsed.terminatedArchived ?? 0} (${parsed.activeRosterCount ?? 0} used for matching).`,
        );
        onImportComplete();
      } else {
        setMessage(parsed.error ?? "Import failed.");
      }
    } catch {
      setMessage("Import request failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-teal-500/25 bg-zinc-900/40 p-5">
      <h2 className="text-lg font-semibold text-zinc-50">Upload workforce CSV</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Expected columns: Status, City, State, Zipcode, Date Of Hire, SRS ID, Last Login, Skill Set
      </p>

      <div
        className={`mt-4 flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition-colors ${
          dragOver ? "border-teal-400 bg-teal-500/10" : "border-zinc-700 bg-zinc-950/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) readFile(file);
        }}
      >
        <p className="text-sm text-zinc-400">Drag and drop active-reps-clean.csv here</p>
        <label className="mt-3 cursor-pointer rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800">
          Browse files
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />
        </label>
        {fileName ? <p className="mt-2 text-xs text-teal-300/90">{fileName}</p> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
          Replace dataset
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} />
          Merge dataset
        </label>
        <button
          type="button"
          disabled={!csvText || loading}
          onClick={() => void runPreview()}
          className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Previewing…" : "Preview import"}
        </button>
        <button
          type="button"
          disabled={!csvText || !preview?.ok || importing}
          onClick={() => void runImport()}
          className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-100 disabled:opacity-50"
        >
          {importing ? "Importing…" : "Confirm import"}
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-zinc-300">{message}</p> : null}

      {preview ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total reps" value={preview.stats.totalReps} />
            <StatCard label="Active" value={preview.stats.activeCount} accent="text-emerald-300" />
            <StatCard label="Inactive" value={preview.stats.inactiveCount} accent="text-amber-300" />
            <StatCard label="States" value={preview.stats.statesCovered} />
            <StatCard label="Skill sets" value={preview.stats.uniqueSkillSets} />
          </div>
          <p className="text-xs text-zinc-500">
            Recent logins (14d): {preview.stats.recentLoginCount} · Valid rows: {preview.validRowCount}
          </p>

          {preview.errors.length > 0 ? (
            <ul className="text-xs text-red-300">
              {preview.errors.slice(0, 8).map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}

          <PreviewTable rows={preview.previewRows} />
        </div>
      ) : null}
    </section>
  );
}

function StatCard({
  label,
  value,
  accent = "text-zinc-50",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
      <p className="text-[10px] uppercase text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent}`}>{value}</p>
    </article>
  );
}

function PreviewTable({ rows }: { rows: WorkforceCsvPreviewRow[] }) {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0] ?? {});
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-500">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/50 text-zinc-300">
              {headers.map((h) => (
                <td key={h} className="max-w-[140px] truncate px-2 py-1.5">
                  {row[h] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2 py-1 text-[10px] text-zinc-600">Showing first {rows.length} rows</p>
    </div>
  );
}
