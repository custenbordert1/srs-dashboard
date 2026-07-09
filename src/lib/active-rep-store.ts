import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import {
  buildWorkforceImportSummary,
  splitWorkforceReps,
  type WorkforceImportSummary,
} from "@/lib/workforce-intelligence/workforce-roster";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

const STORE_PATH = path.join(recruitingDataDir(), "active-reps.json");

/** @deprecated Legacy single-array store — migrated on read. */
type LegacyActiveRepStoreFile = {
  reps: ActiveRep[];
  updatedAt: string;
  importedAt: string;
  importedBy?: string;
  source?: string;
};

export type ActiveRepStoreFile = {
  activeRoster: ActiveRep[];
  inactiveArchive: ActiveRep[];
  terminatedArchive: ActiveRep[];
  updatedAt: string;
  importedAt: string;
  importedBy?: string;
  source?: string;
  lastImportSummary?: WorkforceImportSummary;
};

function emptyStore(now: string): ActiveRepStoreFile {
  return {
    activeRoster: [],
    inactiveArchive: [],
    terminatedArchive: [],
    updatedAt: now,
    importedAt: now,
  };
}

function migrateLegacyStore(parsed: LegacyActiveRepStoreFile): ActiveRepStoreFile {
  const split = splitWorkforceReps(Array.isArray(parsed.reps) ? parsed.reps : []);
  const importedAt = parsed.importedAt ?? parsed.updatedAt ?? new Date().toISOString();
  return {
    activeRoster: split.active,
    inactiveArchive: split.inactive,
    terminatedArchive: split.terminated,
    updatedAt: parsed.updatedAt ?? importedAt,
    importedAt,
    importedBy: parsed.importedBy,
    source: parsed.source,
    lastImportSummary: buildWorkforceImportSummary(parsed.reps ?? [], split),
  };
}

function normalizeStore(parsed: Partial<ActiveRepStoreFile> & Partial<LegacyActiveRepStoreFile>): ActiveRepStoreFile {
  if (Array.isArray(parsed.activeRoster)) {
    const importedAt = parsed.importedAt ?? parsed.updatedAt ?? new Date().toISOString();
    return {
      activeRoster: parsed.activeRoster,
      inactiveArchive: Array.isArray(parsed.inactiveArchive) ? parsed.inactiveArchive : [],
      terminatedArchive: Array.isArray(parsed.terminatedArchive) ? parsed.terminatedArchive : [],
      updatedAt: parsed.updatedAt ?? importedAt,
      importedAt,
      importedBy: parsed.importedBy,
      source: parsed.source,
      lastImportSummary: parsed.lastImportSummary,
    };
  }
  if (Array.isArray(parsed.reps)) {
    return migrateLegacyStore(parsed as LegacyActiveRepStoreFile);
  }
  return emptyStore(new Date().toISOString());
}

async function readStore(): Promise<ActiveRepStoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return normalizeStore(JSON.parse(raw) as Partial<ActiveRepStoreFile> & Partial<LegacyActiveRepStoreFile>);
  } catch {
    return emptyStore(new Date().toISOString());
  }
}

async function writeStore(file: ActiveRepStoreFile): Promise<void> {
  const storeDir = recruitingDataDir();
  await mkdir(storeDir, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(file, null, 2), "utf8");
}

export type ListImportedRepsOptions = {
  /** When true, returns active + inactive + terminated archives. Default false (active roster only). */
  includeInactive?: boolean;
};

/** Active roster for dashboards/matching (default). Pass includeInactive for analysis. */
export async function listImportedReps(options?: ListImportedRepsOptions): Promise<ActiveRep[]> {
  const file = await readStore();
  if (options?.includeInactive) {
    return [...file.activeRoster, ...file.inactiveArchive, ...file.terminatedArchive];
  }
  return file.activeRoster;
}

export async function listActiveRosterReps(): Promise<ActiveRep[]> {
  return (await readStore()).activeRoster;
}

export async function listInactiveArchiveReps(): Promise<ActiveRep[]> {
  return (await readStore()).inactiveArchive;
}

export async function listTerminatedArchiveReps(): Promise<ActiveRep[]> {
  return (await readStore()).terminatedArchive;
}

export async function getActiveRepStoreMeta(): Promise<ActiveRepStoreFile> {
  return readStore();
}

/** Counts for sync-health and data-health panels (active roster is default for operations). */
export async function getActiveRepStoreCounts(): Promise<{
  active: number;
  inactive: number;
  terminated: number;
  totalArchived: number;
}> {
  const file = await readStore();
  return {
    active: file.activeRoster.length,
    inactive: file.inactiveArchive.length,
    terminated: file.terminatedArchive.length,
    totalArchived: file.inactiveArchive.length + file.terminatedArchive.length,
  };
}

function persistSplitReps(reps: ActiveRep[], importedBy?: string): Promise<ActiveRepStoreFile> {
  const split = splitWorkforceReps(reps);
  const now = new Date().toISOString();
  const file: ActiveRepStoreFile = {
    activeRoster: split.active,
    inactiveArchive: split.inactive,
    terminatedArchive: split.terminated,
    updatedAt: now,
    importedAt: now,
    importedBy,
    source: "workforce_csv",
    lastImportSummary: buildWorkforceImportSummary(reps, split),
  };
  return writeStore(file).then(() => file);
}

export async function replaceImportedReps(
  reps: ActiveRep[],
  importedBy?: string,
): Promise<ActiveRepStoreFile> {
  return persistSplitReps(reps, importedBy);
}

export async function mergeImportedReps(
  incoming: ActiveRep[],
  mode: "replace" | "merge",
  importedBy?: string,
): Promise<ActiveRepStoreFile> {
  if (mode === "replace") {
    return replaceImportedReps(incoming, importedBy);
  }

  const existing = await readStore();
  const mapActive = new Map<string, ActiveRep>();
  const mapInactive = new Map<string, ActiveRep>();
  const mapTerminated = new Map<string, ActiveRep>();

  for (const rep of existing.activeRoster) mapActive.set(rep.repId, rep);
  for (const rep of existing.inactiveArchive) mapInactive.set(rep.repId, rep);
  for (const rep of existing.terminatedArchive) mapTerminated.set(rep.repId, rep);

  const splitIncoming = splitWorkforceReps(incoming);
  for (const rep of splitIncoming.active) {
    mapActive.set(rep.repId, rep);
    mapInactive.delete(rep.repId);
    mapTerminated.delete(rep.repId);
  }
  for (const rep of splitIncoming.inactive) {
    mapInactive.set(rep.repId, rep);
    mapActive.delete(rep.repId);
    mapTerminated.delete(rep.repId);
  }
  for (const rep of splitIncoming.terminated) {
    mapTerminated.set(rep.repId, rep);
    mapActive.delete(rep.repId);
    mapInactive.delete(rep.repId);
  }

  const merged = [
    ...mapActive.values(),
    ...mapInactive.values(),
    ...mapTerminated.values(),
  ];
  return replaceImportedReps(merged, importedBy);
}
