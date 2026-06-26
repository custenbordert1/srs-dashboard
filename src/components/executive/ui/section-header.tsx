import type { ReactNode } from "react";
import { StatusBadge, type StatusBadgeTone } from "@/components/executive/ui/status-badge";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: StatusBadgeTone;
  actions?: ReactNode;
  eyebrow?: string;
};

export function SectionHeader({
  title,
  subtitle,
  badge,
  badgeTone = "preview",
  actions,
  eyebrow,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="text-sm font-medium text-zinc-500">{eyebrow}</p> : null}
        <div className={`flex flex-wrap items-center gap-3 ${eyebrow ? "mt-1" : ""}`}>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{title}</h2>
          {badge ? <StatusBadge tone={badgeTone}>{badge}</StatusBadge> : null}
        </div>
        {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
