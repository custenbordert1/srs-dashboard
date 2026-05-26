"use client";

import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import {
  getRecruitingTabSource,
  type RecruitingTabSourceKind,
} from "@/lib/recruiting-tab-source-labels";

const KIND_STYLES: Record<
  RecruitingTabSourceKind,
  { border: string; bg: string; badge: string; text: string }
> = {
  "live-breezy": {
    border: "border-teal-500/30",
    bg: "bg-teal-500/10",
    badge: "border-teal-500/35 bg-teal-500/15 text-teal-100",
    text: "text-teal-100/90",
  },
  "live-mel": {
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    badge: "border-sky-500/35 bg-sky-500/15 text-sky-100",
    text: "text-sky-100/90",
  },
  "live-workforce": {
    border: "border-violet-500/30",
    bg: "bg-violet-500/10",
    badge: "border-violet-500/35 bg-violet-500/15 text-violet-100",
    text: "text-violet-100/90",
  },
  "archive-sheet": {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    badge: "border-amber-500/35 bg-amber-500/15 text-amber-100",
    text: "text-amber-100/90",
  },
  demo: {
    border: "border-zinc-600/50",
    bg: "bg-zinc-900/60",
    badge: "border-zinc-600/60 bg-zinc-800/80 text-zinc-300",
    text: "text-zinc-400",
  },
  system: {
    border: "border-zinc-600/50",
    bg: "bg-zinc-900/60",
    badge: "border-zinc-600/60 bg-zinc-800/80 text-zinc-300",
    text: "text-zinc-400",
  },
  mixed: {
    border: "border-amber-500/25",
    bg: "bg-amber-500/5",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    text: "text-amber-100/85",
  },
  executive: {
    border: "border-violet-500/30",
    bg: "bg-violet-500/10",
    badge: "border-violet-500/35 bg-violet-500/15 text-violet-100",
    text: "text-violet-100/90",
  },
};

type RecruitingTabSourceBannerProps = {
  tabId: DashboardTabId;
};

/** Static source-of-truth banner — no fetches, no routing changes. */
export function RecruitingTabSourceBanner({ tabId }: RecruitingTabSourceBannerProps) {
  const meta = getRecruitingTabSource(tabId);
  const styles = KIND_STYLES[meta.kind];

  return (
    <div
      role="note"
      className={[
        "flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-start sm:justify-between",
        styles.border,
        styles.bg,
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <span
          className={[
            "inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            styles.badge,
          ].join(" ")}
        >
          {meta.badgeLabel}
        </span>
        <p className={`mt-2 text-sm ${styles.text}`}>{meta.bannerMessage}</p>
      </div>
      <p className="shrink-0 text-xs text-zinc-500">
        Live ATS: <span className="font-medium text-teal-300/90">Breezy HR</span>
        <span className="hidden sm:inline"> · Cache diagnostics on Command Center</span>
      </p>
    </div>
  );
}
