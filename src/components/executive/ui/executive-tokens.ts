/** Centralized semantic colors, glass surfaces, and motion for the executive design system. */

export const executiveSemantic = {
  info: {
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/15",
    ring: "ring-sky-500/20",
    fill: "stroke-sky-400",
  },
  healthy: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/15",
    ring: "ring-emerald-500/20",
    fill: "stroke-emerald-400",
  },
  attention: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/15",
    ring: "ring-amber-500/20",
    fill: "stroke-amber-400",
  },
  critical: {
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/15",
    ring: "ring-rose-500/20",
    fill: "stroke-rose-400",
  },
  neutral: {
    text: "text-zinc-400",
    bg: "bg-zinc-800/35",
    border: "border-zinc-700/25",
    ring: "ring-zinc-600/20",
    fill: "stroke-zinc-500",
  },
} as const;

export type ExecutiveSemanticTone = keyof typeof executiveSemantic;

export const executiveGlass = {
  panel:
    "rounded-3xl border border-white/[0.06] bg-zinc-900/30 shadow-xl shadow-black/20 backdrop-blur-xl",
  panelSoft:
    "rounded-2xl border border-white/[0.04] bg-zinc-900/20 shadow-lg shadow-black/15 backdrop-blur-md",
  inset: "rounded-2xl bg-zinc-950/35 backdrop-blur-sm",
  chip: "rounded-full border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm",
} as const;

/** @deprecated Use executiveGlass */
export const executiveSurface = executiveGlass;

export const executiveMotion = {
  card: "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/25",
  button: "transition-all duration-150 ease-out",
  chip: "transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-md hover:shadow-black/20",
  nav: "transition-all duration-200 ease-out",
} as const;

export function healthToneFromPercent(percent: number | null): ExecutiveSemanticTone {
  if (percent == null) return "neutral";
  if (percent >= 80) return "healthy";
  if (percent >= 60) return "attention";
  return "critical";
}

export function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function firstNameFromDisplayName(name?: string | null): string {
  if (!name?.trim()) return "there";
  return name.trim().split(/\s+/)[0] ?? name;
}

export function formatChatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
}
