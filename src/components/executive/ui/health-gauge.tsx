import { executiveSemantic, healthToneFromPercent } from "@/components/executive/ui/executive-tokens";

type HealthGaugeProps = {
  label: string;
  value?: number | null;
  textValue?: string | null;
  loading?: boolean;
  size?: number;
};

export function HealthGauge({
  label,
  value = null,
  textValue,
  loading,
  size = 72,
}: HealthGaugeProps) {
  const numeric = value != null ? value : null;
  const tone = healthToneFromPercent(numeric);
  const styles = executiveSemantic[tone];
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = numeric != null ? Math.min(100, Math.max(0, numeric)) / 100 : 0;
  const dashOffset = circumference * (1 - progress);
  const showRing = !loading && numeric != null;

  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-zinc-800/80"
          />
          {showRing ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className={styles.fill}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center px-1">
          {loading ? (
            <div className="h-4 w-8 ex-shimmer rounded-full" />
          ) : numeric != null ? (
            <span className={["text-sm font-semibold tabular-nums", styles.text].join(" ")}>{numeric}</span>
          ) : textValue ? (
            <span className="text-center text-[10px] font-semibold leading-tight text-zinc-300">{textValue}</span>
          ) : (
            <span className="text-sm font-medium text-zinc-600">—</span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-zinc-500">{label}</p>
    </div>
  );
}
