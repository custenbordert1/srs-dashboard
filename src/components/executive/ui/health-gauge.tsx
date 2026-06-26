import { executiveSemantic, healthToneFromPercent } from "@/components/executive/ui/executive-tokens";

type HealthGaugeProps = {
  label: string;
  value: number | null;
  loading?: boolean;
  size?: number;
};

export function HealthGauge({ label, value, loading, size = 72 }: HealthGaugeProps) {
  const tone = healthToneFromPercent(value);
  const styles = executiveSemantic[tone];
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = value != null ? Math.min(100, Math.max(0, value)) / 100 : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            className="text-zinc-800/80"
          />
          {!loading && value != null ? (
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
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <div className="h-5 w-8 ex-shimmer rounded" />
          ) : (
            <span className={["text-sm font-semibold tabular-nums", styles.text].join(" ")}>
              {value != null ? value : "—"}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-zinc-500">{label}</p>
    </div>
  );
}
