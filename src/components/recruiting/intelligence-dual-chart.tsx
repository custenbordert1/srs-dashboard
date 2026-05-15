"use client";

import type { ComparisonBar } from "@/lib/demand-intelligence";

type IntelligenceDualChartProps = {
  title: string;
  subtitle?: string;
  data: ComparisonBar[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryClassName?: string;
  secondaryClassName?: string;
};

export function IntelligenceDualChart({
  title,
  subtitle,
  data,
  primaryLabel,
  secondaryLabel,
  primaryClassName = "bg-violet-500/80",
  secondaryClassName = "bg-sky-500/80",
}: IntelligenceDualChartProps) {
  const max = Math.max(...data.flatMap((d) => [d.primary, d.secondary]), 1);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-2">
            <span className={`h-2 w-4 rounded-full ${primaryClassName}`} />
            {primaryLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className={`h-2 w-4 rounded-full ${secondaryClassName}`} />
            {secondaryLabel}
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No data available for this chart.</p>
      ) : (
        <ul className="mt-4 space-y-4" aria-label={title}>
          {data.map((item) => {
            const primaryWidth = Math.max(4, Math.round((item.primary / max) * 100));
            const secondaryWidth = Math.max(4, Math.round((item.secondary / max) * 100));
            return (
              <li key={item.label}>
                <p className="mb-2 truncate text-sm font-medium text-zinc-200">{item.label}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                      {item.primary.toLocaleString()}
                    </span>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
                      <div
                        className={`h-full rounded-full ${primaryClassName}`}
                        style={{ width: `${primaryWidth}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                      {item.secondary.toLocaleString()}
                    </span>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800/80">
                      <div
                        className={`h-full rounded-full ${secondaryClassName}`}
                        style={{ width: `${secondaryWidth}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
