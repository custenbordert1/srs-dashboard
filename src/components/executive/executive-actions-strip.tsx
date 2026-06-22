"use client";

import Link from "next/link";

type ExecutiveActionsStripProps = {
  overdueAccountability: number;
  needsAttention: number;
  pipelineBottlenecks: number;
};

function ActionCard({
  label,
  count,
  href,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  tone: "red" | "amber" | "teal";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-500/35 bg-red-500/10 text-red-100"
      : tone === "amber"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
        : "border-teal-500/35 bg-teal-500/10 text-teal-100";

  return (
    <Link
      href={href}
      className={`rounded-xl border px-4 py-3 transition-colors hover:brightness-110 ${toneClass}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{count}</p>
    </Link>
  );
}

export function ExecutiveActionsStrip({
  overdueAccountability,
  needsAttention,
  pipelineBottlenecks,
}: ExecutiveActionsStripProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">Executive actions</h2>
      <p className="mt-1 text-sm text-zinc-500">Jump to the highest-impact work queues.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ActionCard
          label="Overdue accountability"
          count={overdueAccountability}
          href="/?tab=executive-accountability&view=overdue"
          tone="red"
        />
        <ActionCard
          label="Needs attention"
          count={needsAttention}
          href="/?tab=needs-attention"
          tone="amber"
        />
        <ActionCard
          label="Pipeline bottlenecks"
          count={pipelineBottlenecks}
          href="/?tab=pipeline-intelligence"
          tone="teal"
        />
      </div>
    </section>
  );
}
