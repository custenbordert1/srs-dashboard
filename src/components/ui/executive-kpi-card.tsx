import type { ReactNode } from "react";
import type { StatusTone } from "@/lib/ui/status-tone";
import { STATUS_TONE_STYLES } from "@/lib/ui/status-tone";

export type ExecutiveKpiTrend = {
  direction: "up" | "down" | "flat";
  label: string;
};

type ExecutiveKpiCardProps = {
  label: string;
  value: string;
  trend?: ExecutiveKpiTrend;
  tone?: StatusTone;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
};

function TrendBadge({ trend }: { trend: ExecutiveKpiTrend }) {
  const positive = trend.direction === "up";
  const flat = trend.direction === "flat";
  return (
    <span
      className={[
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        flat
          ? "bg-zinc-800 text-zinc-400"
          : positive
            ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20"
            : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20",
      ].join(" ")}
    >
      {!flat ? (positive ? "↑" : "↓") : null} {trend.label}
    </span>
  );
}

export function ExecutiveKpiCard({
  label,
  value,
  trend,
  tone = "info",
  hint,
  onClick,
  active = false,
}: ExecutiveKpiCardProps) {
  const styles = STATUS_TONE_STYLES[tone];
  const className = [
    "flex h-[88px] min-h-[88px] flex-col justify-between rounded-xl border bg-zinc-900/50 p-3 text-left shadow-sm shadow-black/10",
    styles.border,
    active ? "ring-2 ring-teal-500/30" : "",
    onClick ? "cursor-pointer transition hover:bg-zinc-900/70" : "",
  ].join(" ");

  const body = (
    <>
      <p className={`text-[11px] font-medium uppercase tracking-wide ${styles.label}`}>{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className={`text-2xl font-semibold tabular-nums tracking-tight ${styles.value}`}>{value}</p>
        {trend ? <TrendBadge trend={trend} /> : null}
      </div>
      {hint ? <p className="truncate text-[10px] text-zinc-600">{hint}</p> : <span className="h-3" />}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }

  return <article className={className}>{body}</article>;
}

type ExecutiveKpiGridProps = {
  children: ReactNode;
  columns?: 3 | 4 | 6;
};

export function ExecutiveKpiGrid({ children, columns = 6 }: ExecutiveKpiGridProps) {
  const grid =
    columns === 6
      ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      : columns === 4
        ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        : "grid gap-2 sm:grid-cols-3";
  return <section className={grid}>{children}</section>;
}
