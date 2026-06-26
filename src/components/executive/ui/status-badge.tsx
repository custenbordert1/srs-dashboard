export type StatusBadgeTone = "preview" | "success" | "warning" | "critical" | "neutral" | "info";

const TONE_CLASS: Record<StatusBadgeTone, string> = {
  preview: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  critical: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  neutral: "border-zinc-600/40 bg-zinc-800/50 text-zinc-300",
  info: "border-teal-400/30 bg-teal-500/10 text-teal-200",
};

type StatusBadgeProps = {
  children: string;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        TONE_CLASS[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
