"use client";

import { DmOperationalDashboardShell } from "@/components/dm/dm-operational-dashboard-shell";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";

type DmOperationalDashboardProps = {
  data: DmDashboardSnapshot;
  user: import("@/lib/auth/types").UserPublic;
  meta?: { partialSync?: boolean } | null;
  onCandidateClick: (candidateId: string) => void;
  selectedCandidateId: string | null;
};

export function DmOperationalDashboard({
  data,
  user,
  meta,
  onCandidateClick,
  selectedCandidateId,
}: DmOperationalDashboardProps) {
  return (
    <DmOperationalDashboardShell
      data={data}
      user={user}
      meta={meta}
      onCandidateClick={onCandidateClick}
      selectedCandidateId={selectedCandidateId}
    />
  );
}
