/**
 * Single source of truth for dashboard UI class names.
 * Prefer these tokens over ad-hoc Tailwind in workspace pages.
 */

export const UI_SPACE = {
  page: "space-y-6",
  section: "space-y-3",
  stackSm: "space-y-2",
  gridKpi: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
  gridDual: "grid gap-4 lg:grid-cols-2",
} as const;

export const UI_TYPE = {
  pageTitle: "text-lg font-semibold text-zinc-50",
  pageSubtitle: "mt-1 text-sm text-zinc-400",
  sectionTitle: "text-base font-semibold text-zinc-50",
  sectionSubtitle: "text-xs text-zinc-500",
  kpiValue: "text-2xl font-semibold tabular-nums text-zinc-50",
  kpiLabel: "text-[10px] font-semibold uppercase tracking-wide text-zinc-500",
  tableHead: "bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500",
  boardroomTitle: "text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl lg:text-6xl",
  boardroomKpi: "text-6xl font-bold tabular-nums sm:text-7xl lg:text-8xl",
  boardroomSection: "text-2xl font-semibold sm:text-3xl",
} as const;

export const UI_SURFACE = {
  card: "rounded-xl border border-zinc-800/80 bg-zinc-900/40",
  cardInset: "rounded-xl border border-zinc-800/80 bg-zinc-950/50",
  panel: "rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5",
  tableWrap: "overflow-x-auto rounded-xl border border-zinc-800/80",
} as const;

export const UI_BUTTON = {
  primary:
    "inline-flex items-center justify-center rounded-lg border border-teal-600/45 bg-teal-600/15 px-3 py-1.5 text-xs font-semibold text-teal-100 hover:bg-teal-600/25 disabled:cursor-not-allowed disabled:opacity-40",
  secondary:
    "inline-flex items-center justify-center rounded-lg border border-zinc-600/60 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700/60 disabled:cursor-not-allowed disabled:opacity-40",
  ghost:
    "inline-flex items-center justify-center rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800",
  boardroom:
    "rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-900",
} as const;

export const UI_INPUT = {
  select:
    "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200",
  filterBar: "flex flex-wrap gap-2",
} as const;

export const UI_BADGE = {
  critical:
    "inline-flex rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100",
  high:
    "inline-flex rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100",
  moderate:
    "inline-flex rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100",
  healthy:
    "inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100",
  neutral:
    "inline-flex rounded-full border border-zinc-600/60 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300",
} as const;

export const UI_RISK = {
  critical: "border-red-500/50 bg-red-500/15 text-red-100",
  high: "border-amber-500/45 bg-amber-500/12 text-amber-100",
  moderate: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  stable: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  healthy: "border-emerald-500/40 bg-emerald-500/12 text-emerald-100",
  atRisk: "border-amber-500/45 bg-amber-500/12 text-amber-100",
} as const;

export const UI_LAYOUT = {
  pageHeader: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
  toolbar: "flex flex-wrap items-center gap-2",
  responsiveTable: "min-w-full text-left text-sm",
  boardroomGrid: "grid gap-6 lg:grid-cols-2",
} as const;

export const UI_PERFORMANCE = {
  normalLoadMs: 2000,
  heavyLoadMs: 5000,
} as const;
