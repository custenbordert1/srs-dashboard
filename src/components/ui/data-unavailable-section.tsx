import type { ReactNode } from "react";

type DataUnavailableSectionProps = {
  title: string;
  hasData: boolean;
  children: ReactNode;
  message?: string;
};

export function DataUnavailableSection({
  title,
  hasData,
  children,
  message = "Data not available yet",
}: DataUnavailableSectionProps) {
  if (!hasData) {
    return (
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 px-4 py-3">
        <p className="text-sm font-medium text-zinc-400">{title}</p>
        <p className="mt-1 text-xs text-zinc-600">{message}</p>
      </section>
    );
  }
  return <>{children}</>;
}
