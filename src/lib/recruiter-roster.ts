const RECRUITER_STORAGE_KEY = "srs-dashboard-recruiter-roster";
const DM_STORAGE_KEY = "srs-dashboard-dm-roster";

const DEFAULT_RECRUITERS = ["Unassigned", "Taylor", "Recruiting Team"];
const DEFAULT_DMS = ["Unassigned", "Field Ops"];

function readRoster(storageKey: string, defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults;
    const values = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    return values.length > 0 ? sortedUnique(values) : defaults;
  } catch {
    return defaults;
  }
}

function writeRoster(storageKey: string, values: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(sortedUnique(values)));
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function loadRecruiterRoster(): string[] {
  return readRoster(RECRUITER_STORAGE_KEY, DEFAULT_RECRUITERS);
}

export function saveRecruiterRoster(values: string[]): string[] {
  const roster = sortedUnique(["Unassigned", ...values.filter((value) => value !== "Unassigned")]);
  writeRoster(RECRUITER_STORAGE_KEY, roster);
  return roster;
}

export function addRecruiterToRoster(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return loadRecruiterRoster();
  return saveRecruiterRoster([...loadRecruiterRoster(), trimmed]);
}

export function loadDmRoster(): string[] {
  return readRoster(DM_STORAGE_KEY, DEFAULT_DMS);
}

export function saveDmRoster(values: string[]): string[] {
  const roster = sortedUnique(["Unassigned", ...values.filter((value) => value !== "Unassigned")]);
  writeRoster(DM_STORAGE_KEY, roster);
  return roster;
}

export function addDmToRoster(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return loadDmRoster();
  return saveDmRoster([...loadDmRoster(), trimmed]);
}
