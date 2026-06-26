import type { ReactNode } from "react";

type ExecutiveSummaryProps = {
  title?: string;
  children: ReactNode;
  accent?: boolean;
};

export function ExecutiveSummary({ title = "Executive summary", children, accent = false }: ExecutiveSummaryProps) {
  return (
    <div
      className={[
        "rounded-2xl p-4 sm:p-5 ring-1 ring-inset",
        accent ? "bg-sky-500/[0.05] ring-sky-500/15" : "bg-zinc-950/35 ring-white/[0.04]",
      ].join(" ")}
    >
      <p className="text-xs font-medium text-zinc-500">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-zinc-100">{children}</div>
    </div>
  );
}
