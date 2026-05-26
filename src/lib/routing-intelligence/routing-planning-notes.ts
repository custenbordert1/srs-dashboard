const STORAGE_KEY = "srs-routing-planning-notes-v1";

type NotesStore = Record<string, string>;

function readStore(): NotesStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as NotesStore;
  } catch {
    return {};
  }
}

function writeStore(store: NotesStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getRoutingPlanningNote(routePackId: string): string {
  return readStore()[routePackId] ?? "";
}

export function setRoutingPlanningNote(routePackId: string, note: string): void {
  const store = readStore();
  if (!note.trim()) {
    delete store[routePackId];
  } else {
    store[routePackId] = note.trim();
  }
  writeStore(store);
}

export function getRecruiterReviewFlags(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:review`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function toggleRecruiterReviewFlag(routePackId: string): boolean {
  const flags = getRecruiterReviewFlags();
  if (flags.has(routePackId)) flags.delete(routePackId);
  else flags.add(routePackId);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${STORAGE_KEY}:review`, JSON.stringify([...flags]));
  }
  return flags.has(routePackId);
}
