"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
          {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
        <span className="shrink-0 text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="border-t border-zinc-800/80 px-4 pb-4 pt-3">{children}</div> : null}
    </section>
  );
}
