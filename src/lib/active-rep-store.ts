import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import path from "node:path";

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(STORE_DIR, "active-reps.json");

export type ActiveRepStoreFile = {
  reps: ActiveRep[];
  updatedAt: string;
  importedAt: string;
  importedBy?: string;
  source?: string;
};

async function readStore(): Promise<ActiveRepStoreFile> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as ActiveRepStoreFile;
    const importedAt = parsed.importedAt ?? parsed.updatedAt ?? new Date().toISOString();
    return {
      reps: Array.isArray(parsed.reps) ? parsed.reps : [],
      updatedAt: parsed.updatedAt ?? importedAt,
      importedAt,
      importedBy: parsed.importedBy,
      source: parsed.source,
    };
  } catch {
    const now = new Date().toISOString();
    return { reps: [], updatedAt: now, importedAt: now };
  }
}

async function writeStore(file: ActiveRepStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(file, null, 2), "utf8");
}

export async function listImportedReps(): Promise<ActiveRep[]> {
  const file = await readStore();
  return file.reps;
}

export async function getActiveRepStoreMeta(): Promise<ActiveRepStoreFile> {
  return readStore();
}

export async function replaceImportedReps(
  reps: ActiveRep[],
  importedBy?: string,
): Promise<ActiveRepStoreFile> {
  const now = new Date().toISOString();
  const file: ActiveRepStoreFile = {
    reps,
    updatedAt: now,
    importedAt: now,
    importedBy,
    source: "workforce_csv",
  };
  await writeStore(file);
  return file;
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
  const map = new Map<string, ActiveRep>();
  for (const rep of existing.reps) map.set(rep.repId, rep);
  for (const rep of incoming) map.set(rep.repId, rep);
  return replaceImportedReps([...map.values()], importedBy);
}
