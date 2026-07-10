import type { DistrictManager } from "@/lib/dm-territory-map";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";

/** Canonical recruiters used for territory-scoped auto-assignment. */
export const CANONICAL_RECRUITER_ROSTER = [
  "Taylor",
  "Alex",
  "Jordan",
  "Morgan",
  "Casey",
  "Riley",
  "Sam",
  "Chris",
  "Drew",
  "Logan",
] as const;

export type CanonicalRecruiter = (typeof CANONICAL_RECRUITER_ROSTER)[number];

/** Primary and backup recruiters aligned to each DM territory. */
export const RECRUITERS_BY_DM: Record<DistrictManager, readonly CanonicalRecruiter[]> = {
  "Amy Harp": ["Jordan", "Morgan"],
  "Mindie Rodriguez": ["Taylor", "Alex"],
  "Erin Boatright": ["Casey", "Riley"],
  "Lori VandeWiele": ["Sam", "Logan"],
  "Melissa O'Connor": ["Chris", "Drew"],
  "Shelly Debellis": ["Drew", "Logan"],
  "Trista Thomas": ["Alex", "Morgan"],
};

export function getDmRecruiterPool(dmName: string | null | undefined): CanonicalRecruiter[] {
  if (!dmName) return [];
  const pool = RECRUITERS_BY_DM[dmName as DistrictManager];
  return pool ? [...pool] : [];
}

export function getTerritoryEligibleRecruiters(input: {
  territoryState: string;
  rosterRecruiters: string[];
}): string[] {
  const dmName = getDmForState(input.territoryState);
  const dmPool = getDmRecruiterPool(dmName ?? null);
  const rosterSet = new Set(
    input.rosterRecruiters.filter((name) => name !== "Unassigned" && name !== "Recruiting Team"),
  );

  const eligible = dmPool.filter((recruiter) => rosterSet.has(recruiter));
  if (eligible.length > 0) return eligible;

  const canonicalInRoster = CANONICAL_RECRUITER_ROSTER.filter((recruiter) => rosterSet.has(recruiter));
  if (canonicalInRoster.length > 0) return [...canonicalInRoster];

  return input.rosterRecruiters.filter((name) => name !== "Unassigned" && name !== "Recruiting Team");
}

export function mergeRecruiterRoster(recruiters: string[]): string[] {
  const merged = new Set<string>(["Unassigned", "Recruiting Team", ...recruiters, ...CANONICAL_RECRUITER_ROSTER]);
  return [...merged].sort((a, b) => a.localeCompare(b));
}

export function stableRecruiterTieBreak(recruiters: string[], candidateId: string): string {
  if (recruiters.length === 0) return "";
  const sorted = [...recruiters].sort((a, b) => a.localeCompare(b));
  let hash = 0;
  for (const ch of candidateId) hash = (hash + ch.charCodeAt(0)) % 9973;
  return sorted[hash % sorted.length]!;
}

export function explainRecruiterEligibility(input: {
  territoryState: string;
  rosterRecruiters: string[];
}): {
  dmName: string | null;
  dmPool: string[];
  eligible: string[];
  ineligible: string[];
} {
  const state = normalizeStateCode(input.territoryState);
  const dmName = getDmForState(state) ?? null;
  const dmPool = getDmRecruiterPool(dmName);
  const eligible = getTerritoryEligibleRecruiters({
    territoryState: state,
    rosterRecruiters: mergeRecruiterRoster(input.rosterRecruiters),
  });
  const rosterSet = new Set(mergeRecruiterRoster(input.rosterRecruiters));
  const ineligible = [...rosterSet].filter(
    (name) => name !== "Unassigned" && name !== "Recruiting Team" && !eligible.includes(name),
  );
  return { dmName, dmPool: [...dmPool], eligible, ineligible };
}
