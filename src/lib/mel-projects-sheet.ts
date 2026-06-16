import {
  fetchGoogleSheetCsvById,
  getGoogleSheetCsvUrl,
  type SheetDataFailure,
  type SheetDataResult,
  type SheetDataSuccess,
  type SheetRow,
} from "@/lib/google-sheet-csv";
import { melConfigErrorMessage } from "@/lib/env-validation";

/** One row from the MEL projects Google Sheet (header keys match CSV columns). */
export type MelProjectRow = SheetRow;

export type MelProjectsDataSuccess = SheetDataSuccess & {
  rows: MelProjectRow[];
};

export type MelProjectsDataFailure = SheetDataFailure;

export type MelProjectsDataResult = MelProjectsDataSuccess | MelProjectsDataFailure;

export const MEL_PROJECTS_FETCH_TIMEOUT_MS = 5_000;
export const MEL_PROJECTS_CACHE_TTL_MS = 5 * 60 * 1000;
export const MEL_PROJECTS_MAX_ROWS = 15_000;

type MelCacheEntry = {
  result: MelProjectsDataResult;
  expiresAt: number;
};

let melCacheEntry: MelCacheEntry | null = null;

function getMelProjectsSheetId(): string | undefined {
  return process.env.GOOGLE_MEL_PROJECTS_SHEET_ID?.trim() || undefined;
}

function getMelProjectsSheetGid(): string {
  const raw = process.env.GOOGLE_MEL_PROJECTS_SHEET_GID?.trim();
  return raw && raw.length > 0 ? raw : "0";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchMelProjectsSheetUncached(): Promise<MelProjectsDataResult> {
  const sheetId = getMelProjectsSheetId();
  const gid = getMelProjectsSheetGid();
  const fetchedAt = new Date().toISOString();

  if (!sheetId) {
    return {
      ok: false,
      error: melConfigErrorMessage(),
      fetchedAt,
      csvUrl: "",
    };
  }

  const result: SheetDataResult = await fetchGoogleSheetCsvById(sheetId, gid);
  return result as MelProjectsDataResult;
}

export async function fetchMelProjectsSheet(options?: {
  forceRefresh?: boolean;
}): Promise<MelProjectsDataResult> {
  const startedAt = Date.now();
  const now = Date.now();

  if (!options?.forceRefresh && melCacheEntry && melCacheEntry.expiresAt > now) {
    const cached = melCacheEntry.result;
    console.info("[mel-projects-sheet] cache_hit", {
      ok: cached.ok,
      rowCount: cached.ok ? cached.rows.length : 0,
      ageMs: now - (melCacheEntry.expiresAt - MEL_PROJECTS_CACHE_TTL_MS),
    });
    return cached;
  }

  let result: MelProjectsDataResult;
  try {
    result = await Promise.race([
      fetchMelProjectsSheetUncached(),
      sleep(MEL_PROJECTS_FETCH_TIMEOUT_MS).then(() => {
        const fetchedAt = new Date().toISOString();
        return {
          ok: false as const,
          error: `MEL projects sheet fetch timed out after ${MEL_PROJECTS_FETCH_TIMEOUT_MS}ms`,
          fetchedAt,
          csvUrl: getMelProjectsCsvUrl(),
        };
      }),
    ]);
  } catch (error) {
    const fetchedAt = new Date().toISOString();
    result = {
      ok: false,
      error: error instanceof Error ? error.message : "MEL fetch failed",
      fetchedAt,
      csvUrl: getMelProjectsCsvUrl(),
    };
  }

  const fetchMs = Date.now() - startedAt;
  if (result.ok && result.rows.length > MEL_PROJECTS_MAX_ROWS) {
    console.warn("[mel-projects-sheet] row_cap_applied", {
      rowCount: result.rows.length,
      cap: MEL_PROJECTS_MAX_ROWS,
      fetchMs,
    });
    result = {
      ...result,
      rows: result.rows.slice(0, MEL_PROJECTS_MAX_ROWS),
    };
  }

  console.info("[mel-projects-sheet] fetch_complete", {
    ok: result.ok,
    rowCount: result.ok ? result.rows.length : 0,
    fetchMs,
    fromCache: false,
  });

  if (result.ok) {
    melCacheEntry = {
      result,
      expiresAt: Date.now() + MEL_PROJECTS_CACHE_TTL_MS,
    };
    return result;
  }

  if (melCacheEntry?.result.ok) {
    console.warn("[mel-projects-sheet] serving_stale_after_failure", {
      error: result.error,
      staleRowCount: melCacheEntry.result.rows.length,
      fetchMs,
    });
    return melCacheEntry.result;
  }

  return result;
}

export function getMelProjectsCsvUrl(): string {
  const sheetId = getMelProjectsSheetId();
  const gid = getMelProjectsSheetGid();
  if (!sheetId) return "";
  return getGoogleSheetCsvUrl(sheetId, gid);
}

export function __resetMelProjectsSheetCacheForTests(): void {
  melCacheEntry = null;
}
