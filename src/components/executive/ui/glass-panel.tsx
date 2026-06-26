import type { ReactNode } from "react";
import { executiveGlass, executiveMotion } from "@/components/executive/ui/executive-tokens";

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  soft?: boolean;
  hover?: boolean;
};

export function GlassPanel({ children, className = "", soft = false, hover = false }: GlassPanelProps) {
  return (
    <div
      className={[
        soft ? executiveGlass.panelSoft : executiveGlass.panel,
        hover ? executiveMotion.card : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
