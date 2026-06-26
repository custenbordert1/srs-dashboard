import type { ReactNode } from "react";
import Link from "next/link";
import { GlassPanel } from "@/components/executive/ui/glass-panel";
import { executiveMotion, executiveSemantic } from "@/components/executive/ui/executive-tokens";

type OpportunityCardProps = {
  title?: string;
  children: ReactNode;
  href?: string;
  icon?: ReactNode;
};

export function OpportunityCard({
  title = "Today's biggest opportunity",
  children,
  href,
  icon,
}: OpportunityCardProps) {
  const body = (
    <GlassPanel soft hover className={["p-5 sm:p-6", executiveSemantic.healthy.bg, executiveMotion.card].join(" ")}>
      <div className={`flex items-center gap-2 ${executiveSemantic.healthy.text}`}>
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-zinc-200">{children}</div>
    </GlassPanel>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40">
        {body}
      </Link>
    );
  }
  return body;
}
