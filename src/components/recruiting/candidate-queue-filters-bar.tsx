"use client";

import {
  P199_DAYS_SINCE_APPLIED_OPTIONS,
  P199_QUEUE_SORT_OPTIONS,
  type P199DaysSinceAppliedId,
  type P199QueueFilterState,
  type P199QueueSortId,
} from "@/lib/p199-candidate-queue-ux";
import { useEffect, useId, useRef, useState } from "react";

const controlClass =
  "rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-xs text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20";

type CandidateQueueFiltersBarProps = {
  stateOptions: string[];
  filters: P199QueueFilterState;
  onChange: (next: P199QueueFilterState) => void;
  resultCount: number;
};

export function CandidateQueueFiltersBar({
  stateOptions,
  filters,
  onChange,
  resultCount,
}: CandidateQueueFiltersBarProps) {
  const [stateOpen, setStateOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const stateListId = useId();

  useEffect(() => {
    if (!stateOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setStateOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [stateOpen]);

  function toggleState(state: string) {
    const normalized = state.trim().toUpperCase();
    const exists = filters.states.includes(normalized);
    const states = exists
      ? filters.states.filter((s) => s !== normalized)
      : [...filters.states, normalized].sort((a, b) => a.localeCompare(b));
    onChange({ ...filters, states });
  }

  function clearStates() {
    onChange({ ...filters, states: [] });
  }

  const stateLabel =
    filters.states.length === 0
      ? "All states"
      : filters.states.length <= 3
        ? filters.states.join(", ")
        : `${filters.states.length} states`;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5">
      <div className="relative min-w-[10rem]" ref={panelRef}>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          State
        </label>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={stateOpen}
          aria-controls={stateListId}
          className={`${controlClass} flex w-full min-w-[10rem] items-center justify-between gap-2`}
          onClick={() => setStateOpen((open) => !open)}
        >
          <span className="truncate">{stateLabel}</span>
          <span className="text-zinc-500">▾</span>
        </button>
        {stateOpen ? (
          <div
            id={stateListId}
            role="listbox"
            aria-multiselectable="true"
            className="absolute z-30 mt-1 max-h-56 w-full min-w-[12rem] overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950 p-1 shadow-xl"
          >
            <button
              type="button"
              className="mb-1 w-full rounded px-2 py-1 text-left text-[11px] text-zinc-400 hover:bg-zinc-900"
              onClick={clearStates}
            >
              Clear states
            </button>
            {stateOptions.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-zinc-500">No states in loaded queue</p>
            ) : (
              stateOptions.map((state) => {
                const selected = filters.states.includes(state);
                return (
                  <label
                    key={state}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleState(state)}
                    />
                    <span>{state}</span>
                  </label>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="min-w-[9rem]">
        <label
          htmlFor="p199-days-filter"
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
        >
          Days since applied
        </label>
        <select
          id="p199-days-filter"
          className={`${controlClass} w-full`}
          value={filters.daysSinceApplied}
          onChange={(event) =>
            onChange({
              ...filters,
              daysSinceApplied: event.target.value as P199DaysSinceAppliedId,
            })
          }
        >
          {P199_DAYS_SINCE_APPLIED_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-[11rem]">
        <label
          htmlFor="p199-sort-filter"
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
        >
          Sort
        </label>
        <select
          id="p199-sort-filter"
          className={`${controlClass} w-full`}
          value={filters.sort}
          onChange={(event) =>
            onChange({
              ...filters,
              sort: event.target.value as P199QueueSortId,
              headerColumn: null,
            })
          }
        >
          {P199_QUEUE_SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <p className="ml-auto self-center text-[11px] tabular-nums text-zinc-400">
        {resultCount.toLocaleString()} matching
        {filters.states.length || filters.daysSinceApplied !== "all" ? " (filtered)" : null}
      </p>
    </div>
  );
}
