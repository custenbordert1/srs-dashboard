import type { ReactNode } from "react";
import { panelShell, typography } from "@/lib/ui/typography";
import type { StatusTone } from "@/lib/ui/status-tone";
import { STATUS_TONE_STYLES } from "@/lib/ui/status-tone";

type PanelCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
};

export function PanelCard({ title, description, children, tone, className = "" }: PanelCardProps) {
  const accent = tone ? STATUS_TONE_STYLES[tone].border : "border-zinc-700/50";
  return (
    <section className={`${panelShell} ${accent} ${className}`}>
      <header className="mb-3">
        <h3 className={typography.cardTitle}>{title}</h3>
        {description ? <p className={`mt-1 ${typography.caption}`}>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
