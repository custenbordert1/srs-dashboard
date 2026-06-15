import type { StatusTone } from "@/lib/ui/status-tone";
import { STATUS_TONE_STYLES } from "@/lib/ui/status-tone";
import { panelShell, typography } from "@/lib/ui/typography";

export type HealthMetricLine = {
  label: string;
  value: string;
};

type HealthGroupCardProps = {
  title: string;
  primaryLabel: string;
  primaryValue: string;
  tone?: StatusTone;
  supporting?: HealthMetricLine[];
};

export function HealthGroupCard({
  title,
  primaryLabel,
  primaryValue,
  tone = "info",
  supporting = [],
}: HealthGroupCardProps) {
  const styles = STATUS_TONE_STYLES[tone];
  return (
    <article className={`${panelShell} ${styles.border} flex min-h-[120px] flex-col justify-between`}>
      <div>
        <p className={typography.label}>{title}</p>
        <p className={`mt-2 ${typography.metric} ${styles.value}`}>{primaryValue}</p>
        <p className={`mt-1 ${typography.caption}`}>{primaryLabel}</p>
      </div>
      {supporting.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-zinc-800/60 pt-3">
          {supporting.map((line) => (
            <li key={line.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-400">{line.label}</span>
              <span className="font-medium tabular-nums text-zinc-200">{line.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
