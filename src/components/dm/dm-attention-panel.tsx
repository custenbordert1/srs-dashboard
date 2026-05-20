import type { DmAttentionItem, DmCandidateSummary } from "@/lib/dm-dashboard";
import { useState } from "react";

export type DmDashboardAction = "attention" | "fill-risk" | "top-candidates" | "recent";

const TABS: Array<{ id: DmDashboardAction; label: string }> = [
  { id: "attention", label: "Needs attention" },
  { id: "fill-risk", label: "Highest fill risk" },
  { id: "top-candidates", label: "Top candidates" },
  { id: "recent", label: "Recent applicants" },
];

function severityStyles(severity: DmAttentionItem["severity"]): string {
  return severity === "critical"
    ? "border-red-500/30 bg-red-500/10 text-red-100"
    : "border-amber-500/30 bg-amber-500/10 text-amber-100";
}

function AttentionList({ items, emptyLabel }: { items: DmAttentionItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={`rounded-lg border px-3 py-2.5 text-sm ${severityStyles(item.severity)}`}
        >
          <p className="font-medium">{item.title}</p>
          <p className="mt-0.5 text-xs opacity-90">{item.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function CandidateTable({
  rows,
  onCandidateClick,
  selectedCandidateId,
}: {
  rows: DmCandidateSummary[];
  onCandidateClick?: (candidateId: string) => void;
  selectedCandidateId?: string | null;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No candidates in this view.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-3 font-medium">Candidate</th>
            <th className="pb-2 pr-3 font-medium">Score</th>
            <th className="pb-2 pr-3 font-medium">Position</th>
            <th className="pb-2 pr-3 font-medium">Location</th>
            <th className="pb-2 pr-3 font-medium">Stage</th>
            <th className="pb-2 font-medium">Applied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.candidateId}
              role={onCandidateClick ? "button" : undefined}
              tabIndex={onCandidateClick ? 0 : undefined}
              onClick={onCandidateClick ? () => onCandidateClick(row.candidateId) : undefined}
              onKeyDown={
                onCandidateClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onCandidateClick(row.candidateId);
                      }
                    }
                  : undefined
              }
              className={`border-b border-zinc-800/60 last:border-0 ${
                onCandidateClick ? "cursor-pointer hover:bg-zinc-800/40" : ""
              } ${selectedCandidateId === row.candidateId ? "bg-teal-500/10" : ""}`}
            >
              <td className="py-2.5 pr-3 font-medium text-zinc-100">{row.name}</td>
              <td className="py-2.5 pr-3 tabular-nums text-zinc-300">
                {row.score > 0 ? (
                  <>
                    {row.score} <span className="text-xs text-zinc-500">({row.tierLabel})</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2.5 pr-3 text-zinc-400">{row.position}</td>
              <td className="py-2.5 pr-3 text-zinc-400">
                {row.city}, {row.state}
              </td>
              <td className="py-2.5 pr-3 text-zinc-400">{row.stage}</td>
              <td className="py-2.5 text-zinc-400">{row.appliedDate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DmAttentionPanelProps = {
  needsAttention: DmAttentionItem[];
  highestFillRisk: DmAttentionItem[];
  topCandidates: DmCandidateSummary[];
  recentApplicants: DmCandidateSummary[];
  onCandidateClick?: (candidateId: string) => void;
  selectedCandidateId?: string | null;
};

export function DmAttentionPanel({
  needsAttention,
  highestFillRisk,
  topCandidates,
  recentApplicants,
  onCandidateClick,
  selectedCandidateId,
}: DmAttentionPanelProps) {
  const [active, setActive] = useState<DmDashboardAction>("attention");

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <div className="flex flex-wrap gap-2 border-b border-zinc-800/80 pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              active === tab.id
                ? "bg-teal-600 text-white"
                : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {active === "attention" ? (
          <AttentionList items={needsAttention} emptyLabel="No items need attention right now." />
        ) : null}
        {active === "fill-risk" ? (
          <AttentionList items={highestFillRisk} emptyLabel="No fill-risk alerts in your territory." />
        ) : null}
        {active === "top-candidates" ? (
          <CandidateTable
            rows={topCandidates}
            onCandidateClick={onCandidateClick}
            selectedCandidateId={selectedCandidateId}
          />
        ) : null}
        {active === "recent" ? (
          <CandidateTable
            rows={recentApplicants}
            onCandidateClick={onCandidateClick}
            selectedCandidateId={selectedCandidateId}
          />
        ) : null}
      </div>
    </section>
  );
}
