"use client";

import { UI_BUTTON, UI_SURFACE, UI_TYPE } from "@/lib/ui-tokens";

type WorkspaceEmptyStateProps = {
  title: string;
  message: string;
  nextStep?: string;
  onRefresh?: () => void;
  refreshLabel?: string;
};

export function WorkspaceEmptyState({
  title,
  message,
  nextStep,
  onRefresh,
  refreshLabel = "Refresh data",
}: WorkspaceEmptyStateProps) {
  return (
    <div className={`${UI_SURFACE.panel} text-center`}>
      <p className={UI_TYPE.sectionTitle}>{title}</p>
      <p className={`mt-2 text-sm text-zinc-400`}>{message}</p>
      {nextStep ? <p className="mt-2 text-xs text-teal-200/90">{nextStep}</p> : null}
      {onRefresh ? (
        <button type="button" onClick={onRefresh} className={`${UI_BUTTON.secondary} mt-4`}>
          {refreshLabel}
        </button>
      ) : null}
    </div>
  );
}
