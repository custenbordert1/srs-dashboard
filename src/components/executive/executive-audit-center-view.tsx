"use client";

import { useMemo, useState } from "react";
import {
  filterAuditCenterRows,
  uniqueAuditOwners,
  type AuditCenterRow,
} from "@/lib/executive-accountability/audit-center";
import type { ExecutiveActionStatus } from "@/lib/executive-accountability/types";
import { startOfUtcWeek } from "@/lib/executive-accountability/weekly-summary";

type ExecutiveAuditCenterViewProps = {
  rows: AuditCenterRow[];
};

const STATUS_OPTIONS: Array<ExecutiveActionStatus | "all"> = [
  "all",
  "open",
  "in_progress",
  "completed",
  "dismissed",
  "archived",
];

export function ExecutiveAuditCenterView({ rows }: ExecutiveAuditCenterViewProps) {
  const [owner, setOwner] = useState<string>("all");
  const [status, setStatus] = useState<ExecutiveActionStatus | "all">("all");
  const [range, setRange] = useState<"week" | "30d" | "all">("week");

  const owners = useMemo(() => uniqueAuditOwners(rows), [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const startMs =
      range === "week"
        ? startOfUtcWeek(now)
        : range === "30d"
          ? now - 30 * 24 * 60 * 60 * 1000
          : undefined;
    return filterAuditCenterRows(rows, {
      owner: owner === "all" ? undefined : owner,
      status,
      startMs,
      endMs: range === "all" ? undefined : now,
    });
  }, [rows, owner, status, range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 print:hidden">
        <label className="text-xs text-zinc-500">
          Owner
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="ml-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
          >
            <option value="all">All</option>
            {owners.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ExecutiveActionStatus | "all")}
            className="ml-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
          >
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Date range
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as "week" | "30d" | "all")}
            className="ml-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
          >
            <option value="week">This week</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">Before</th>
              <th className="px-3 py-2">After</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No audit entries match filters.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 100).map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/60">
                  <td className="px-3 py-2 text-xs text-zinc-400">
                    {new Date(row.changedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{row.changedBy}</td>
                  <td className="px-3 py-2 text-zinc-200">{row.actionTitle}</td>
                  <td className="px-3 py-2 text-zinc-400">{row.field}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{row.oldValue ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-300">{row.newValue ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
