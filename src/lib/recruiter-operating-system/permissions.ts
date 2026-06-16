import { isAdminRole, isRecruiterRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/types";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { RecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/types";

export function canAccessRecruiterOperatingSystem(session: AuthSession): boolean {
  return isRecruiterRole(session.role) || isAdminRole(session.role);
}

export function resolveRecruiterOperatingSystemScope(
  session: AuthSession,
  requestedRecruiter?: string | null,
): RecruiterOperatingSystemScope {
  const territoryStates = filterStatesForSession(session) ?? [];
  const sessionName = session.name.trim();

  if (isRecruiterRole(session.role)) {
    return {
      recruiterName: sessionName,
      recruiterLabel: sessionName || "Unassigned",
      territoryStates,
      role: session.role,
      scopedToRecruiter: true,
    };
  }

  const recruiterName = requestedRecruiter?.trim() || "";
  const scopedToRecruiter = recruiterName.length > 0;
  return {
    recruiterName: scopedToRecruiter ? recruiterName : "",
    recruiterLabel: scopedToRecruiter ? recruiterName : "All recruiters",
    territoryStates,
    role: session.role,
    scopedToRecruiter,
  };
}

export function isRecruiterNameInScope(
  recruiterName: string | null | undefined,
  scope: RecruiterOperatingSystemScope,
): boolean {
  if (!scope.scopedToRecruiter || !scope.recruiterName) return true;
  if (!recruiterName || isUnassignedRecruiter(recruiterName)) return false;
  return recruiterName.trim().toLowerCase() === scope.recruiterName.trim().toLowerCase();
}

export function isCandidateRecruiterInScope(
  assignedRecruiter: string | null | undefined,
  scope: RecruiterOperatingSystemScope,
): boolean {
  return isRecruiterNameInScope(assignedRecruiter, scope);
}
