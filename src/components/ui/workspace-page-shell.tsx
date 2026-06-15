"use client";

import { TabSkeleton } from "@/components/ui/tab-skeleton";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspaceErrorRecovery } from "@/components/ui/workspace-error-recovery";
import type { ReactNode } from "react";

type WorkspacePageShellProps = {
  loading: boolean;
  error?: string | null;
  hasData: boolean;
  loadingMessage?: string;
  emptyTitle: string;
  emptyMessage: string;
  emptyNextStep?: string;
  onRefresh?: () => void;
  partialDataAvailable?: boolean;
  children: ReactNode;
};

export function WorkspacePageShell({
  loading,
  error,
  hasData,
  loadingMessage = "Loading workspace…",
  emptyTitle,
  emptyMessage,
  emptyNextStep,
  onRefresh,
  partialDataAvailable = false,
  children,
}: WorkspacePageShellProps) {
  if (loading && !hasData) {
    return <TabSkeleton message={loadingMessage} rows={5} cards={4} />;
  }

  if (error && !hasData) {
    return (
      <WorkspaceErrorRecovery
        error={error}
        partialDataAvailable={partialDataAvailable}
        onRetry={onRefresh}
      />
    );
  }

  if (!hasData) {
    return (
      <WorkspaceEmptyState
        title={emptyTitle}
        message={emptyMessage}
        nextStep={emptyNextStep}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <>
      {error ? (
        <WorkspaceErrorRecovery
          error={error}
          partialDataAvailable
          onRetry={onRefresh}
        />
      ) : null}
      {children}
    </>
  );
}
