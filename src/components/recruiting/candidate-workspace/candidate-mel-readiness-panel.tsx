"use client";

import type { MelReadinessItem } from "@/lib/candidate-workspace";

type CandidateMelReadinessPanelProps = {
  items: MelReadinessItem[];
};

export function CandidateMelReadinessPanel({ items }: CandidateMelReadinessPanelProps) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">MEL readiness</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                item.complete
                  ? "border-teal-500/50 bg-teal-500/20 text-teal-100"
                  : "border-zinc-600 bg-zinc-950 text-zinc-600"
              }`}
              aria-hidden
            >
              {item.complete ? "✓" : ""}
            </span>
            <span className={item.complete ? "text-zinc-200" : "text-zinc-400"}>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
