/**
 * P203.1 — Production recruiter directory for selector options.
 * Demo/placeholder names are never surfaced unless they exist in a real directory source.
 */

export const DEMO_RECRUITER_NAMES = [
  "Alex",
  "Casey",
  "Chris",
  "Drew",
  "Jordan",
  "Logan",
  "Morgan",
  "Riley",
  "Sam",
] as const;

const DEMO_RECRUITER_SET = new Set<string>(DEMO_RECRUITER_NAMES);

/** Stable production defaults always available in the selector. */
export const PRODUCTION_BASE_RECRUITERS = ["Unassigned", "Taylor", "Recruiting Team"] as const;

export const P203_ACTING_RECRUITER_SESSION_KEY = "srs.p203.actingRecruiter";

export type BuildProductionRecruiterOptions = {
  /** Authoritative directory names (env, auth users, etc.). */
  directory?: readonly string[];
  /** Roster values from the workflow store (may contain legacy demos). */
  roster?: readonly string[];
  /** Extra names treated as inactive and excluded. */
  inactive?: readonly string[];
  /** When false, omit Recruiting Team even if present in inputs. Default true. */
  includeRecruitingTeam?: boolean;
};

function trimName(value: string): string {
  return value.trim();
}

export function isDemoRecruiterName(name: string): boolean {
  return DEMO_RECRUITER_SET.has(trimName(name));
}

export function readProductionRecruiterDirectoryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.SRS_PRODUCTION_RECRUITERS ?? env.PRODUCTION_RECRUITER_DIRECTORY ?? "";
  if (!raw.trim()) return [];
  return raw
    .split(/[,|;]/)
    .map(trimName)
    .filter(Boolean);
}

export function readInactiveRecruitersFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.SRS_INACTIVE_RECRUITERS ?? "";
  if (!raw.trim()) return [];
  return raw
    .split(/[,|;]/)
    .map(trimName)
    .filter(Boolean);
}

/**
 * Build selector options: Unassigned first, then alphabetically sorted named recruiters.
 * Scrubs demo placeholders from store rosters, removes duplicates/inactive names.
 * Demo names are kept only when they appear in the authoritative `directory` source.
 */
export function buildProductionRecruiterSelectorOptions(
  input: BuildProductionRecruiterOptions = {},
): string[] {
  const includeRecruitingTeam = input.includeRecruitingTeam !== false;
  const inactive = new Set((input.inactive ?? []).map(trimName).filter(Boolean));
  const directorySet = new Set((input.directory ?? []).map(trimName).filter(Boolean));

  const collected = new Set<string>();

  const add = (raw: string, fromDirectory: boolean) => {
    const name = trimName(raw);
    if (!name || inactive.has(name)) return;
    if (name === "Recruiting Team" && !includeRecruitingTeam) return;
    if (!fromDirectory && isDemoRecruiterName(name) && !directorySet.has(name)) return;
    collected.add(name);
  };

  for (const raw of PRODUCTION_BASE_RECRUITERS) add(raw, false);
  for (const raw of input.directory ?? []) add(raw, true);
  for (const raw of input.roster ?? []) add(raw, false);

  if (!collected.has("Unassigned")) collected.add("Unassigned");
  if (includeRecruitingTeam) collected.add("Recruiting Team");

  const named = [...collected]
    .filter((name) => name !== "Unassigned")
    .sort((a, b) => a.localeCompare(b));

  return ["Unassigned", ...named];
}

/** Scrub demo/inactive names from an arbitrary roster list (preserve order otherwise). */
export function scrubDemoRecruiters(
  recruiters: readonly string[],
  inactive: readonly string[] = [],
): string[] {
  return buildProductionRecruiterSelectorOptions({
    roster: recruiters,
    inactive,
    includeRecruitingTeam: true,
  });
}

export function loadActingRecruiterFromSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(P203_ACTING_RECRUITER_SESSION_KEY);
    const trimmed = raw?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export function saveActingRecruiterToSession(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(P203_ACTING_RECRUITER_SESSION_KEY, name.trim());
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Resolve acting recruiter for the selector:
 * 1) session selection if still valid
 * 2) logged-in recruiter if present on the list
 * 3) preferred production default (Taylor → named → Recruiting Team)
 */
export function resolveActingRecruiter(input: {
  recruiters: readonly string[];
  sessionStored?: string | null;
  loggedInRecruiter?: string | null;
}): string {
  const list = input.recruiters.map(trimName).filter(Boolean);
  const set = new Set(list);

  const sessionStored = input.sessionStored?.trim();
  if (sessionStored && set.has(sessionStored)) return sessionStored;

  const loggedIn = input.loggedInRecruiter?.trim();
  if (loggedIn && set.has(loggedIn)) return loggedIn;

  if (set.has("Taylor")) return "Taylor";
  const named = list.find((r) => r !== "Unassigned" && r !== "Recruiting Team");
  if (named) return named;
  if (set.has("Recruiting Team")) return "Recruiting Team";
  return list[0] ?? "Unassigned";
}
