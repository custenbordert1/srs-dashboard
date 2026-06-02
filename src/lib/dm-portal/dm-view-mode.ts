import { isDmRole } from "@/lib/auth/roles";
import type { UserPublic, UserRole } from "@/lib/auth/types";
import { isDistrictManagerPortalRole, toPortalRoleKey, type PortalRoleKey } from "@/lib/dm-portal/roles";

export type DmViewModeInput = {
  role: UserRole;
  territoryStates?: string[];
  dmName?: string;
  /** Admin preview of DM portal without changing auth. */
  preview?: boolean;
};

export type DmViewModeState = {
  enabled: boolean;
  portalRole: PortalRoleKey;
  territoryStates: string[];
  dmName?: string;
};

export type DmViewVisibility = {
  showOpenJobs: boolean;
  showApplicantCounts: boolean;
  showOpenOpportunities: boolean;
  showActiveReps: boolean;
  showCoveragePercent: boolean;
  showNeedsAttention: boolean;
  hideOtherDmTerritories: boolean;
  hideAdminSettings: boolean;
  hideSystemDiagnostics: boolean;
  hideFullCandidateDatabase: boolean;
};

export function isDmViewModeEnabled(input: DmViewModeInput): boolean {
  if (input.preview === true) return true;
  if (process.env.NEXT_PUBLIC_DM_PORTAL_VIEW_MODE === "1") return true;
  return isDistrictManagerPortalRole(input.role);
}

export function resolveDmViewModeFromUser(
  user: Pick<UserPublic, "role" | "territoryStates" | "dmName" | "name">,
  options?: { preview?: boolean },
): DmViewModeState {
  const enabled = isDmViewModeEnabled({
    role: user.role,
    territoryStates: user.territoryStates,
    dmName: user.dmName,
    preview: options?.preview,
  });
  return {
    enabled,
    portalRole: toPortalRoleKey(user.role),
    territoryStates: user.territoryStates ?? [],
    dmName: user.dmName ?? (isDmRole(user.role) ? user.name : undefined),
  };
}

export function getDmViewVisibility(state: DmViewModeState): DmViewVisibility {
  const on = state.enabled;
  return {
    showOpenJobs: on,
    showApplicantCounts: on,
    showOpenOpportunities: on,
    showActiveReps: on,
    showCoveragePercent: on,
    showNeedsAttention: on,
    hideOtherDmTerritories: on,
    hideAdminSettings: on,
    hideSystemDiagnostics: on,
    hideFullCandidateDatabase: on,
  };
}
