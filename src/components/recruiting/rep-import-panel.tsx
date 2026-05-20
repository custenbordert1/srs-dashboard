"use client";

import { useState } from "react";

type ImportResult = {
  ok: boolean;
  importedCount?: number;
  totalReps?: number;
  errors?: Array<{ row: number; message: string }>;
  error?: string;
};

export function RepImportPanel() {
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<"replace" | "merge">("merge");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function downloadTemplate() {
    const res = await fetch("/api/reps/import?download=template");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "active-rep-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/reps/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode }),
      });
      const parsed = (await res.json()) as ImportResult;
      setResult(parsed);
    } catch {
      setResult({ ok: false, error: "Import request failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Import active reps</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Upload a CSV roster to supplement MEL staff data. Stored locally in <code className="text-zinc-400">.data/active-reps.json</code>.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void downloadTemplate()}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
        >
          Download template
        </button>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="radio"
            checked={mode === "merge"}
            onChange={() => setMode("merge")}
          />
          Merge
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="radio"
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
          />
          Replace all
        </label>
      </div>

      <textarea
        className="mt-3 h-32 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200"
        placeholder="Paste CSV content or fill after downloading template…"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />

      <button
        type="button"
        disabled={loading || !csv.trim()}
        onClick={() => void handleImport()}
        className="mt-2 rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-100 disabled:opacity-50"
      >
        {loading ? "Importing…" : "Import reps"}
      </button>

      {result ? (
        <p
          className={`mt-2 text-xs ${result.ok ? "text-emerald-300" : "text-red-300"}`}
          role="status"
        >
          {result.ok
            ? `Imported ${result.importedCount} reps (${result.totalReps} total).`
            : result.error ?? result.errors?.map((e) => `Row ${e.row}: ${e.message}`).join(" ")}
        </p>
      ) : null}
    </section>
  );
}
