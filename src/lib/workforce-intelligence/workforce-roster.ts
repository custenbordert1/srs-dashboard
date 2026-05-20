import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

export type WorkforceRosterClass = "active" | "inactive" | "terminated";

export type WorkforceRosterSplit = {
  active: ActiveRep[];
  inactive: ActiveRep[];
  terminated: ActiveRep[];
};

export type WorkforceImportSummary = {
  totalRowsParsed: number;
  activeImported: number;
  inactiveArchived: number;
  terminatedArchived: number;
  activeRosterCount: number;
  inactiveArchiveCount: number;
  terminatedArchiveCount: number;
};

function isActiveStatusValue(status: string): boolean {
  const v = status.trim().toLowerCase();
  if (!v) return false;
  return v === "active" || v === "a" || v === "yes" || v === "1";
}

/** Classify workforce CSV Status into active roster vs archives. */
export function classifyWorkforceRosterClass(status: string): WorkforceRosterClass {
  const v = status.trim().toLowerCase();
  if (isActiveStatusValue(v)) return "active";
  if (
    v.includes("term") ||
    v.includes("offboard") ||
    v.includes("separated") ||
    v.includes("resigned") ||
    v.includes("fired") ||
    v.includes("deceased")
  ) {
    return "terminated";
  }
  return "inactive";
}

export function splitWorkforceReps(reps: ActiveRep[]): WorkforceRosterSplit {
  const active: ActiveRep[] = [];
  const inactive: ActiveRep[] = [];
  const terminated: ActiveRep[] = [];

  for (const rep of reps) {
    const rosterClass = classifyWorkforceRosterClass(rep.status ?? (rep.active ? "active" : "inactive"));
    const normalized: ActiveRep = {
      ...rep,
      active: rosterClass === "active",
      melStatus: rosterClass === "active" ? "active" : "inactive",
    };
    if (rosterClass === "active") active.push(normalized);
    else if (rosterClass === "terminated") terminated.push(normalized);
    else inactive.push(normalized);
  }

  return { active, inactive, terminated };
}

export function buildWorkforceImportSummary(
  parsed: ActiveRep[],
  stored?: { active: ActiveRep[]; inactive: ActiveRep[]; terminated: ActiveRep[] },
): WorkforceImportSummary {
  const split = splitWorkforceReps(parsed);
  return {
    totalRowsParsed: parsed.length,
    activeImported: split.active.length,
    inactiveArchived: split.inactive.length,
    terminatedArchived: split.terminated.length,
    activeRosterCount: stored?.active.length ?? split.active.length,
    inactiveArchiveCount: stored?.inactive.length ?? split.inactive.length,
    terminatedArchiveCount: stored?.terminated.length ?? split.terminated.length,
  };
}

export function filterRepsForMatching(
  reps: ActiveRep[],
  options?: { includeInactive?: boolean },
): ActiveRep[] {
  if (options?.includeInactive) return reps;
  return reps.filter((r) => r.active);
}
