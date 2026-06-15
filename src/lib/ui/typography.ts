/** Shared typography classes — P16 readability tokens. */
export const typography = {
  pageTitle: "text-2xl font-semibold tracking-tight text-zinc-50 sm:text-[1.625rem]",
  sectionTitle: "text-lg font-semibold text-zinc-100 sm:text-[1.375rem]",
  cardTitle: "text-base font-semibold text-zinc-100 sm:text-lg",
  body: "text-[15px] leading-relaxed text-zinc-200",
  bodySm: "text-sm leading-relaxed text-zinc-200",
  label: "text-xs font-medium uppercase tracking-wide text-zinc-400",
  muted: "text-sm leading-relaxed text-zinc-400",
  caption: "text-xs leading-snug text-zinc-500",
  metric: "text-2xl font-bold tabular-nums tracking-tight text-zinc-50 sm:text-3xl",
  tableHeader: "text-xs font-semibold uppercase tracking-wide text-zinc-400",
  tableCell: "text-sm leading-snug text-zinc-200",
} as const;

export const panelShell =
  "rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-4 shadow-sm shadow-black/10 sm:p-5";

export const scanPriority = {
  critical: "border-l-2 border-l-red-400",
  action: "border-l-2 border-l-amber-400",
  healthy: "border-l-2 border-l-emerald-400",
  info: "border-l-2 border-l-sky-400",
} as const;
