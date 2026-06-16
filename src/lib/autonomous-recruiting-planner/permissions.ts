import { isAdminRole, isDmRole, isRecruiterRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/types";
import { resolveDmOperatingSystemScope } from "@/lib/dm-operating-system/permissions";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import type { AutonomousRecruitingPlannerScope } from "@/lib/autonomous-recruiting-planner/types";

export function canAccessAutonomousRecruitingPlanner(session: AuthSession): boolean {
  return (
    isAdminRole(session.role) ||
    session.role === "executive" ||
    isDmRole(session.role) ||
    isRecruiterRole(session.role)
  );
}

export function resolveAutonomousRecruitingPlannerScope(
  session: AuthSession,
  requestedRecruiter?: string | null,
): AutonomousRecruitingPlannerScope {
  if (isDmRole(session.role)) {
    const dmScope = resolveDmOperatingSystemScope(session);
    return {
      role: session.role,
      territoryStates: dmScope.territoryStates,
      territoryLabel: dmScope.territoryLabel,
      dmName: dmScope.dmName,
      scopedToTerritory: dmScope.scopedToTerritory,
      scopedToRecruiter: false,
    };
  }

  if (isRecruiterRole(session.role)) {
    const recruiterScope = resolveRecruiterOperatingSystemScope(session);
    return {
      role: session.role,
      territoryStates: recruiterScope.territoryStates,
      territoryLabel:
        recruiterScope.territoryStates.length > 0
          ? recruiterScope.territoryStates.join(", ")
          : "All territories",
      recruiterName: recruiterScope.recruiterName,
      scopedToTerritory: recruiterScope.territoryStates.length > 0,
      scopedToRecruiter: recruiterScope.scopedToRecruiter,
    };
  }

  const recruiterScope = resolveRecruiterOperatingSystemScope(session, requestedRecruiter);
  return {
    role: session.role,
    territoryStates: recruiterScope.territoryStates,
    territoryLabel:
      recruiterScope.territoryStates.length > 0
        ? recruiterScope.territoryStates.join(", ")
        : "All territories",
    recruiterName: recruiterScope.recruiterName || undefined,
    scopedToTerritory: false,
    scopedToRecruiter: recruiterScope.scopedToRecruiter,
  };
}
