"use client";

import { DmOperatingSystem } from "@/components/dm/dm-operating-system";
import { DmCommandCenter } from "@/components/dm/dm-command-center";
import type { UserPublic } from "@/lib/auth/types";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DataTrustInput } from "@/lib/data-trust-state";
import type { DmViewVisibility } from "@/lib/dm-portal/dm-view-mode";

type DmPortalDashboardProps = {
  data: DmDashboardSnapshot;
  visibility: DmViewVisibility;
  territoryLabel: string;
  user: UserPublic;
  meta?: {
    partialSync?: boolean;
    scanMode?: string;
    positionsScanned?: number;
    totalPositionsAvailable?: number;
  } | null;
  refreshing?: boolean;
  onCandidateClick: (candidateId: string) => void;
  selectedCandidateId: string | null;
};

/** @deprecated Use `DmPortalDashboard` — alias kept for imports. */
export type DmPortalDashboardPrototypeProps = DmPortalDashboardProps;

export function DmPortalDashboard({
  data,
  user,
  meta,
  refreshing = false,
  onCandidateClick,
}: DmPortalDashboardProps) {
  const trustInput: DataTrustInput = {
    refreshing,
    hasData: true,
    partialSync: meta?.partialSync,
    scanMode: meta?.scanMode,
    positionsScanned: meta?.positionsScanned,
    totalPositionsAvailable: meta?.totalPositionsAvailable,
  };

  return (
    <>
      <DmOperatingSystem user={user} />
      <DmCommandCenter
        data={data}
        user={user}
        trustInput={trustInput}
        onCandidateClick={onCandidateClick}
      />
    </>
  );
}

/** @deprecated Use `DmPortalDashboard`. */
export const DmPortalDashboardPrototype = DmPortalDashboard;
