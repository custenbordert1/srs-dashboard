import { executiveSemantic, type ExecutiveSemanticTone } from "@/components/executive/ui/executive-tokens";

type HealthMeterProps = {
  label: string;
  value: number | null;
  suffix?: string;
  loading?: boolean;
};

function toneForValue(value: number | null): ExecutiveSemanticTone {
  if (value == null) return "neutral";
  if (value >= 80) return "healthy";
  if (value >= 60) return "attention";
  return "critical";
}

export function HealthMeter({ label, value, suffix = "%", loading }: HealthMeterProps) {
  const tone = toneForValue(value);
  const styles = executiveSemantic[tone];
  const display = value != null ? `${value}${suffix}` : "—";
  const width = value != null ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        {loading ? (
          <div className="h-5 w-10 animate-pulse rounded bg-zinc-800/60" />
        ) : (
          <p className={["text-lg font-semibold tabular-nums tracking-tight", styles.text].join(" ")}>{display}</p>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800/60">
        {!loading && value != null ? (
          <div
            className={["h-full rounded-full transition-all duration-500", styles.bg.replace("/10", "/60")].join(" ")}
            style={{ width: `${width}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-zinc-700/60" />
        )}
      </div>
    </div>
  );
}
