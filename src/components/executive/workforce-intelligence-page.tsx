"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { WorkforceCsvUploadPanel } from "@/components/workforce/workforce-csv-upload-panel";
import { WorkforceMetricsDashboard } from "@/components/workforce/workforce-metrics-dashboard";
import { useCallback, useEffect, useState } from "react";
import type { WorkforceImportStats } from "@/lib/workforce-intelligence/workforce-csv-import";

type StoreMeta = {
  importedAt: string | null;
  importedBy: string | null;
  repCount: number;
  activeRosterCount?: number;
  inactiveArchiveCount?: number;
  terminatedArchiveCount?: number;
};

export function WorkforceIntelligencePage({ user }: { user: UserPublic }) {
  const [meta, setMeta] = useState<StoreMeta | null>(null);
  const [stats, setStats] = useState<WorkforceImportStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMeta = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workforce-intelligence", { cache: "no-store" });
      const parsed = (await res.json()) as {
        ok?: boolean;
        meta?: StoreMeta;
        stats?: WorkforceImportStats;
      };
      if (parsed.ok) {
        setMeta(parsed.meta ?? null);
        setStats(parsed.stats ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/workforce-intelligence", { cache: "no-store" });
        const parsed = (await res.json()) as {
          ok?: boolean;
          meta?: StoreMeta;
          stats?: WorkforceImportStats;
        };
        if (!cancelled && parsed.ok) {
          setMeta(parsed.meta ?? null);
          setStats(parsed.stats ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell
      user={user}
      title="Workforce Intelligence"
      subtitle="Import active-reps-clean.csv to power live rep matching, coverage analytics, and staffing recommendations."
    >
      <div className="space-y-6">
        {meta?.importedAt ? (
          <p className="text-sm text-zinc-500">
            Last import: {new Date(meta.importedAt).toLocaleString()}
            {meta.importedBy ? ` · ${meta.importedBy}` : ""} · {meta.activeRosterCount ?? meta.repCount}{" "}
            active in roster
            {(meta.inactiveArchiveCount ?? 0) + (meta.terminatedArchiveCount ?? 0) > 0
              ? ` · ${meta.inactiveArchiveCount ?? 0} inactive + ${meta.terminatedArchiveCount ?? 0} terminated archived`
              : ""}
          </p>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            No workforce CSV imported yet. Upload active-reps-clean.csv to activate matching.
          </p>
        )}

        <WorkforceCsvUploadPanel onImportComplete={refreshMeta} />

        {loading && !stats ? (
          <p className="text-sm text-zinc-500">Loading workforce metrics…</p>
        ) : stats ? (
          <WorkforceMetricsDashboard stats={stats} />
        ) : null}
      </div>
    </AppShell>
  );
}
