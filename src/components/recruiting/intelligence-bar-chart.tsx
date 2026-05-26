"use client";

import type { ChartBar } from "@/lib/recruiting-intelligence";

type IntelligenceBarChartProps = {
  title: string;
  subtitle?: string;
  data: ChartBar[];
  valueLabel?: string;
  barClassName?: string;
  onItemClick?: (item: ChartBar) => void;
};

export function IntelligenceBarChart({
  title,
  subtitle,
  data,
  valueLabel = "Count",
  barClassName = "bg-sky-500/80",
  onItemClick,
}: IntelligenceBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>

      {data.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No data available for this chart.</p>
      ) : (
        <ul className="mt-4 space-y-3" aria-label={title}>
          {data.map((item) => {
            const widthPercent = Math.max(4, Math.round((item.value / max) * 100));
            const clickable = Boolean(onItemClick);
            return (
              <li key={item.label}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onItemClick?.(item) : undefined}
                  className={`w-full text-left ${clickable ? "rounded-lg px-1 py-1 hover:bg-zinc-800/50" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-zinc-200">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-zinc-400">
                      {item.value.toLocaleString()} {valueLabel}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
                    <div
                      className={`h-full rounded-full ${barClassName}`}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
