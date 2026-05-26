import type { DmAlertOperationsSummary } from "@/lib/dm-dashboard/dm-alert-priority";

type DmAlertOperationsKpisProps = {
  summary: DmAlertOperationsSummary;
  onCriticalClick?: () => void;
  onHighClick?: () => void;
  onAgingClick?: () => void;
  onZeroApplicantsClick?: () => void;
};

const KPI_CARDS: Array<{
  key: keyof DmAlertOperationsSummary;
  label: string;
  hint: string;
  accent?: string;
}> = [
  {
    key: "criticalCount",
    label: "Critical alerts",
    hint: "Immediate territory risk — applicant drought 14d+",
    accent: "border-red-500/50 bg-red-500/15",
  },
  {
    key: "highCount",
    label: "High alerts",
    hint: "7d applicant gaps, 30d+ aging, city drought",
    accent: "border-orange-500/40 bg-orange-500/10",
  },
  {
    key: "agingJobsCount",
    label: "Aging jobs (30d+)",
    hint: "Open roles past 30-day threshold",
    accent: "border-amber-500/35 bg-amber-500/10",
  },
  {
    key: "zeroApplicantJobsCount",
    label: "Zero applicants (7d)",
    hint: "Published jobs with no weekly flow",
    accent: "border-amber-500/30 bg-amber-500/5",
  },
  {
    key: "territoryRecruitingRiskScore",
    label: "Territory risk score",
    hint: "Composite alert pressure vs territory health",
    accent: "border-zinc-700 bg-zinc-900/60",
  },
];

const KPI_CLICK_MAP: Partial<
  Record<
    keyof DmAlertOperationsSummary,
    keyof Pick<
      DmAlertOperationsKpisProps,
      "onCriticalClick" | "onHighClick" | "onAgingClick" | "onZeroApplicantsClick"
    >
  >
> = {
  criticalCount: "onCriticalClick",
  highCount: "onHighClick",
  agingJobsCount: "onAgingClick",
  zeroApplicantJobsCount: "onZeroApplicantsClick",
};

export function DmAlertOperationsKpis({
  summary,
  onCriticalClick,
  onHighClick,
  onAgingClick,
  onZeroApplicantsClick,
}: DmAlertOperationsKpisProps) {
  const handlers = {
    onCriticalClick,
    onHighClick,
    onAgingClick,
    onZeroApplicantsClick,
  };

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {KPI_CARDS.map((card) => {
        const handlerKey = KPI_CLICK_MAP[card.key];
        const onClick = handlerKey ? handlers[handlerKey] : undefined;
        const Tag = onClick ? "button" : "article";
        return (
          <Tag
            key={card.key}
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={`rounded-xl border px-4 py-3 text-left shadow-sm shadow-black/10 ${card.accent ?? "border-zinc-800/80 bg-zinc-900/50"} ${onClick ? "hover:brightness-110" : ""}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
              {summary[card.key].toLocaleString()}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-zinc-500">{card.hint}</p>
          </Tag>
        );
      })}
    </section>
  );
}
