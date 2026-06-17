"use client";

import { useState } from "react";
import type { ExecutiveWeeklyPacket } from "@/lib/executive-accountability/weekly-executive-packet";
import type { RecommendationPriority } from "@/lib/executive-recruiting-forecast";

const PRIORITIES: RecommendationPriority[] = ["critical", "high", "medium", "low"];

function OwnerGroupList({
  groups,
  emptyLabel,
}: {
  groups: Record<string, { title: string; dueDate?: string; priority?: string }[]>;
  emptyLabel: string;
}) {
  const owners = Object.keys(groups);
  if (owners.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-4">
      {owners.map((owner) => (
        <div key={owner}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{owner}</p>
          <ul className="mt-1 space-y-1 text-sm text-zinc-300">
            {groups[owner]!.map((item) => (
              <li key={`${owner}-${item.title}`}>
                · {item.title}
                {item.dueDate ? <span className="text-zinc-500"> — due {item.dueDate}</span> : null}
                {item.priority ? (
                  <span className="ml-1 text-xs text-zinc-500">({item.priority})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type ExecutiveWeeklyPacketViewProps = {
  packet: ExecutiveWeeklyPacket;
  emailMarkdown: string;
};

export function ExecutiveWeeklyPacketView({ packet, emailMarkdown }: ExecutiveWeeklyPacketViewProps) {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(emailMarkdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const weekLabel = new Date(packet.periodStart).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="print-root space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-zinc-500">Week of {weekLabel}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => copyEmail()}
            className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-500/20"
          >
            {copied ? "Copied" : "Copy email markdown"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Print packet
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-700/80 bg-zinc-900/60 px-4 py-4 print:border-zinc-400 print:bg-white print:text-black">
        <h3 className="text-sm font-semibold text-zinc-200 print:text-black">This week</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-100 print:text-black">
          {packet.narrative.summaryParagraph}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-emerald-400/90 print:text-black">Improved</p>
            <ul className="mt-1 space-y-1 text-sm text-zinc-400 print:text-black">
              {packet.narrative.improved.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-amber-400/90 print:text-black">Worsened</p>
            <ul className="mt-1 space-y-1 text-sm text-zinc-400 print:text-black">
              {packet.narrative.worsened.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-zinc-500 print:text-black">
            Immediate leadership actions
          </p>
          <ul className="mt-1 space-y-1 text-sm text-zinc-300 print:text-black">
            {packet.narrative.immediateLeadershipActions.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 print:border-zinc-300 print:bg-white">
        <h3 className="text-sm font-semibold text-zinc-200 print:text-black">Open actions</h3>
        <div className="mt-3 space-y-4">
          {PRIORITIES.map((priority) => {
            const items = packet.openActionsByPriority[priority];
            if (items.length === 0) return null;
            return (
              <div key={priority}>
                <p className="text-xs font-semibold uppercase text-zinc-500">{priority}</p>
                <ul className="mt-1 space-y-1 text-sm text-zinc-300 print:text-black">
                  {items.map((action) => (
                    <li key={action.recommendationId}>
                      · {action.title}{" "}
                      <span className="text-zinc-500">
                        ({action.owner ?? "Unassigned"} · due{" "}
                        {new Date(action.dueDate).toLocaleDateString()})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 print:border-zinc-300 print:bg-white">
        <h3 className="text-sm font-semibold text-zinc-200 print:text-black">Overdue actions</h3>
        <div className="mt-3">
          <OwnerGroupList
            groups={Object.fromEntries(
              Object.entries(packet.overdueByOwner).map(([owner, actions]) => [
                owner,
                actions.map((a) => ({
                  title: a.title,
                  dueDate: new Date(a.dueDate).toLocaleDateString(),
                  priority: a.priority,
                })),
              ]),
            )}
            emptyLabel="No overdue actions."
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 print:border-zinc-300 print:bg-white">
        <h3 className="text-sm font-semibold text-zinc-200 print:text-black">Completed this week</h3>
        <div className="mt-3">
          <OwnerGroupList
            groups={Object.fromEntries(
              Object.entries(packet.completedThisWeekByOwner).map(([owner, actions]) => [
                owner,
                actions.map((a) => ({ title: a.title })),
              ]),
            )}
            emptyLabel="No completions recorded this week."
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 print:border-zinc-300 print:bg-white">
        <h3 className="text-sm font-semibold text-zinc-200 print:text-black">Forecast changes</h3>
        {packet.forecastChanges.lines.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 print:text-black">
            {packet.forecastChanges.hasPriorSnapshot
              ? "No material metric shifts."
              : "Baseline week — trend comparison starts next snapshot."}
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-zinc-300 print:text-black">
            {packet.forecastChanges.lines.map((line) => (
              <li key={line.label}>
                · {line.label}: {line.before} → {line.after}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 print:border-zinc-300 print:bg-white">
        <h3 className="text-sm font-semibold text-zinc-200 print:text-black">Top risks</h3>
        <ul className="mt-2 space-y-1 text-sm text-zinc-300 print:text-black">
          {packet.topRisks.map((risk) => (
            <li key={risk}>· {risk}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
