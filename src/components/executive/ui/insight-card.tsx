import type { ReactNode } from "react";
import { GlassPanel } from "@/components/executive/ui/glass-panel";
import { executiveMotion } from "@/components/executive/ui/executive-tokens";
import { StatusBadge } from "@/components/executive/ui/status-badge";

type InsightCardProps = {
  title: string;
  badge?: string;
  children: ReactNode;
};

export function InsightCard({ title, badge, children }: InsightCardProps) {
  return (
    <GlassPanel soft hover className={["p-5 sm:p-6", executiveMotion.card].join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {badge ? <StatusBadge tone="neutral">{badge}</StatusBadge> : null}
      </div>
      <div className="mt-4">{children}</div>
    </GlassPanel>
  );
}
