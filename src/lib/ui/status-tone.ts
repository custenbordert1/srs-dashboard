export type StatusTone = "healthy" | "warning" | "critical" | "info";

export const STATUS_TONE_STYLES: Record<
  StatusTone,
  { value: string; label: string; border: string; accent: string; dot: string }
> = {
  healthy: {
    value: "text-emerald-300",
    label: "text-zinc-400",
    border: "border-emerald-500/30",
    accent: "bg-emerald-500/10",
    dot: "bg-emerald-400",
  },
  warning: {
    value: "text-amber-300",
    label: "text-zinc-400",
    border: "border-amber-500/30",
    accent: "bg-amber-500/10",
    dot: "bg-amber-400",
  },
  critical: {
    value: "text-red-300",
    label: "text-zinc-400",
    border: "border-red-500/35",
    accent: "bg-red-500/10",
    dot: "bg-red-400",
  },
  info: {
    value: "text-sky-300",
    label: "text-zinc-400",
    border: "border-sky-500/30",
    accent: "bg-sky-500/10",
    dot: "bg-sky-400",
  },
};

export function toneFromCoverageRisk(score: number): StatusTone {
  if (score >= 80) return "critical";
  if (score >= 50) return "warning";
  return "healthy";
}

export function toneFromCount(count: number, warningAt: number, criticalAt: number): StatusTone {
  if (count >= criticalAt) return "critical";
  if (count >= warningAt) return "warning";
  return "healthy";
}
