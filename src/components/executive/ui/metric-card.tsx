import type { ReactNode } from "react";
import { GlassPanel } from "@/components/executive/ui/glass-panel";
import { executiveMotion } from "@/components/executive/ui/executive-tokens";

export type MetricCardStatus = "normal" | "unavailable" | "pending";

export type MetricTrend = {
  direction: "up" | "down" | "flat";
  label: string;
  /** When true, "up" is negative (e.g. overdue count rising). */
  invertColors?: boolean;
};

type MetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
  status?: MetricCardStatus;
  compact?: boolean;
  trend?: MetricTrend;
  icon?: ReactNode;
  classic?: boolean;
};

function trendSymbol(direction: MetricTrend["direction"]): string {
  switch (direction) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    default:
      return "—";
  }
}

function trendClass(trend: MetricTrend): string {
  if (trend.direction === "flat") return "text-zinc-500";
  const positive = trend.direction === "up";
  const good = trend.invertColors ? !positive : positive;
  return good ? "text-emerald-400" : "text-rose-400";
}

export function MetricCard({
  label,
  value,
  hint,
  loading,
  status = "normal",
  compact = false,
  trend,
  icon,
  classic = false,
}: MetricCardProps) {
  const valueClass =
    status === "unavailable" || status === "pending" ? "text-amber-200/90" : "text-zinc-50";

  if (classic) {
    return (
      <div
        className={[
          "rounded-xl bg-zinc-950/25 px-4 py-3.5 ring-1 ring-inset ring-white/[0.04]",
          compact ? "px-3 py-2.5" : "",
        ].join(" ")}
      >
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        {loading ? (
          <div className={`${compact ? "mt-1.5 h-6" : "mt-2 h-8"} ex-shimmer w-16 rounded-md`} />
        ) : (
          <p
            className={[
              "mt-1 font-semibold tabular-nums tracking-tight",
              compact ? "text-base" : "text-2xl",
              valueClass,
            ].join(" ")}
          >
            {value}
          </p>
        )}
        {hint && !loading ? <p className="mt-1 text-xs leading-snug text-zinc-500">{hint}</p> : null}
      </div>
    );
  }

  return (
    <GlassPanel soft hover className={["p-4 sm:p-5", executiveMotion.card, compact ? "!p-3" : ""].join(" ")}>
      {icon ? <div className="mb-3 text-zinc-500">{icon}</div> : null}
      {loading ? (
        <>
          <div className={`${compact ? "h-7" : "h-10"} ex-shimmer w-24 rounded-lg`} />
          <div className="mt-2 h-3 w-28 ex-shimmer rounded" />
        </>
      ) : (
        <>
          <p
            className={[
              "font-semibold tabular-nums tracking-tight",
              compact ? "text-2xl" : "text-3xl sm:text-4xl",
              valueClass,
            ].join(" ")}
          >
            {value}
          </p>
          <p className="mt-1.5 text-xs font-medium leading-snug text-zinc-500">{label}</p>
          {trend ? (
            <p className={["mt-1.5 text-[11px] font-medium", trendClass(trend)].join(" ")}>
              {trendSymbol(trend.direction)} {trend.label}
            </p>
          ) : null}
          {hint && !loading ? <p className="mt-1 text-[11px] leading-snug text-zinc-600">{hint}</p> : null}
          {status === "pending" && !loading ? (
            <p className="mt-1 text-[11px] font-medium text-amber-300/80">Sync pending</p>
          ) : null}
          {status === "unavailable" && !loading ? (
            <p className="mt-1 text-[11px] font-medium text-amber-300/80">Unavailable</p>
          ) : null}
        </>
      )}
    </GlassPanel>
  );
}
