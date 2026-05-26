import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";

export const SEVERITY_LABELS: Record<DmAlertPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Info",
};

export const SEVERITY_CARD_STYLES: Record<DmAlertPriority, string> = {
  critical: "border-red-500/40 bg-red-500/10",
  high: "border-amber-500/40 bg-amber-500/10",
  medium: "border-sky-500/35 bg-sky-500/8",
  low: "border-zinc-700/80 bg-zinc-900/60",
};

export const SEVERITY_BADGE_STYLES: Record<DmAlertPriority, string> = {
  critical: "border-red-500/50 bg-red-500/20 text-red-200",
  high: "border-amber-500/50 bg-amber-500/20 text-amber-100",
  medium: "border-sky-500/45 bg-sky-500/15 text-sky-200",
  low: "border-zinc-600 bg-zinc-800/80 text-zinc-400",
};

const URGENCY_SCORE: Record<DmAlertPriority, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

export function urgencyScoreFor(severity: DmAlertPriority, staffingImpact = 0, agingDays = 0): number {
  return URGENCY_SCORE[severity] + staffingImpact + Math.min(agingDays, 45);
}
