import {
  DEFAULT_DM_ROSTER,
  DEFAULT_RECRUITER_ROSTER,
  defaultRecruiterRosters,
  type RecruiterRosters,
} from "@/lib/candidate-workflow-types";
import { addDmToServerRoster, addRecruiterToServerRoster } from "@/lib/candidate-workflow-client";

export { DEFAULT_RECRUITER_ROSTER, DEFAULT_DM_ROSTER };

/** Fallback when workflow bundle has not loaded yet. */
export function defaultRecruiterRosterList(): string[] {
  return defaultRecruiterRosters().recruiters;
}

export function defaultDmRosterList(): string[] {
  return defaultRecruiterRosters().dms;
}

export function pickActingRecruiter(rosters: RecruiterRosters): string {
  const named = rosters.recruiters.find((r) => r !== "Unassigned");
  return named ?? "Recruiting Team";
}

export async function addRecruiterToRoster(name: string): Promise<RecruiterRosters> {
  return addRecruiterToServerRoster(name);
}

export async function addDmToRoster(name: string): Promise<RecruiterRosters> {
  return addDmToServerRoster(name);
}

/** @deprecated Use rosters from workflow bundle; kept for typing in transitional imports. */
export function loadRecruiterRoster(rosters?: RecruiterRosters): string[] {
  return rosters?.recruiters ?? defaultRecruiterRosterList();
}

/** @deprecated Use rosters from workflow bundle. */
export function loadDmRoster(rosters?: RecruiterRosters): string[] {
  return rosters?.dms ?? defaultDmRosterList();
}
