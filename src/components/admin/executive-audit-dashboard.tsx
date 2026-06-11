"use client";

import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { ProductionReadinessSnapshot } from "@/lib/production-readiness";
import { useEffect, useState } from "react";

export function ExecutiveAuditDashboard() {
  const [snapshot, setSnapshot] = useState<ProductionReadinessSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/admin/production-readiness", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as { ok?: boolean; snapshot?: ProductionReadinessSnapshot };
        if (!cancelled && parsed.ok && parsed.snapshot) setSnapshot(parsed.snapshot);
      } catch {
        // optional panel
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!snapshot) return null;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-zinc-50">Executive audit dashboard</h3>
      <p className="mt-1 text-xs text-zinc-500">
        {snapshot.auditActivity.length} recent events · {snapshot.loginHistory.length} login records
      </p>
      <ul className="mt-4 space-y-2 text-sm text-zinc-300">
        {snapshot.auditActivity.slice(0, 6).map((entry) => (
          <li key={entry.id} className="rounded border border-zinc-800/80 px-3 py-2">
            <span className="text-xs text-zinc-500">{entry.timestamp}</span> · {entry.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}
