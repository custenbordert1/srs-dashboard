import type { ReactNode } from "react";
import { GlassPanel } from "@/components/executive/ui/glass-panel";
import { executiveGlass, executiveMotion } from "@/components/executive/ui/executive-tokens";

export type ExecutiveCardVariant = "default" | "accent" | "premium" | "warning" | "subtle" | "ghost";

const VARIANT_CLASS: Record<ExecutiveCardVariant, string> = {
  default: `${executiveGlass.panelSoft} ${executiveMotion.card}`,
  accent: "rounded-3xl border border-teal-500/10 bg-gradient-to-br from-teal-500/[0.04] via-zinc-900/15 to-zinc-950/30 shadow-lg shadow-black/15 backdrop-blur-md",
  premium:
    "rounded-3xl border border-sky-500/12 bg-gradient-to-b from-sky-500/[0.05] via-zinc-950/35 to-zinc-950/20 shadow-xl shadow-sky-950/10 backdrop-blur-xl",
  warning: "rounded-3xl bg-amber-500/[0.03] ring-1 ring-inset ring-amber-500/12 backdrop-blur-sm",
  subtle: "rounded-2xl bg-zinc-950/30 ring-1 ring-inset ring-white/[0.04] backdrop-blur-sm",
  ghost: "bg-transparent",
};

type ExecutiveCardProps = {
  id?: string;
  variant?: ExecutiveCardVariant;
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article";
};

export function ExecutiveCard({
  id,
  variant = "default",
  className = "",
  children,
  as: Tag = "section",
}: ExecutiveCardProps) {
  return (
    <Tag id={id} className={["p-6 sm:p-8", VARIANT_CLASS[variant], className].join(" ")}>
      {children}
    </Tag>
  );
}

export function ExecutivePanel({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={["rounded-2xl bg-zinc-950/30 p-5 backdrop-blur-sm ring-1 ring-inset ring-white/[0.04] sm:p-6", className].join(" ")}>
      {children}
    </div>
  );
}
