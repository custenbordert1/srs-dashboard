"use client";

import type { RoutingFilterOptions } from "@/lib/routing-intelligence/routing-intelligence-scope";
import { ROUTING_SCOPE_REQUIRED_MESSAGE } from "@/lib/routing-intelligence/routing-intelligence-scope";
import type { RoutingScopeDraft } from "@/hooks/use-routing-intelligence";

type RoutingScopeFiltersProps = {
  options: RoutingFilterOptions;
  value: RoutingScopeDraft;
  onChange: (next: RoutingScopeDraft) => void;
  onBuild: () => void;
  building?: boolean;
  packsError?: string | null;
};

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-[10rem] flex-col gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
      >
        <option value="">All</option>
        {options.map((row) => (
          <option key={row} value={row}>
            {row}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RoutingScopeFilters({
  options,
  value,
  onChange,
  onBuild,
  building = false,
  packsError,
}: RoutingScopeFiltersProps) {
  const hasScope = Boolean(value.dm || value.state || value.project || (value.status && value.status !== "all"));

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-50">Routing scope</h3>
        <p className="text-[11px] text-zinc-500">
          Select DM, state, project, or status before building route packs.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <SelectField
          label="DM"
          value={value.dm ?? ""}
          options={options.dms}
          onChange={(dm) => onChange({ ...value, dm: dm || undefined })}
        />
        <SelectField
          label="State"
          value={value.state ?? ""}
          options={options.states}
          onChange={(state) => onChange({ ...value, state: state || undefined })}
        />
        <SelectField
          label="Project"
          value={value.project ?? ""}
          options={options.projects}
          onChange={(project) => onChange({ ...value, project: project || undefined })}
        />
        <SelectField
          label="Status"
          value={value.status ?? "all"}
          options={options.statuses}
          onChange={(status) => onChange({ ...value, status: (status || "all") as RoutingScopeDraft["status"] })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBuild}
          disabled={building}
          className="rounded-lg border border-teal-600/50 bg-teal-600/10 px-3 py-1.5 text-xs font-medium text-teal-100 disabled:opacity-60"
        >
          {building ? "Building route packs…" : "Build route packs"}
        </button>
        <p className="text-[11px] text-zinc-500">
          {hasScope ? "Scope selected." : ROUTING_SCOPE_REQUIRED_MESSAGE}
        </p>
      </div>

      {packsError ? (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100">
          {packsError}
        </p>
      ) : null}
    </section>
  );
}
