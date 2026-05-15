import {
  fetchGoogleSheetCsvById,
  getGoogleSheetCsvUrl,
  type SheetDataFailure,
  type SheetDataResult,
  type SheetDataSuccess,
  type SheetRow,
} from "@/lib/google-sheet-csv";

/** One row from the MEL projects Google Sheet (header keys match CSV columns). */
export type MelProjectRow = SheetRow;

export type MelProjectsDataSuccess = SheetDataSuccess & {
  rows: MelProjectRow[];
};

export type MelProjectsDataFailure = SheetDataFailure;

export type MelProjectsDataResult = MelProjectsDataSuccess | MelProjectsDataFailure;

function getMelProjectsSheetId(): string | undefined {
  return process.env.GOOGLE_MEL_PROJECTS_SHEET_ID?.trim() || undefined;
}

function getMelProjectsSheetGid(): string {
  const raw = process.env.GOOGLE_MEL_PROJECTS_SHEET_GID?.trim();
  return raw && raw.length > 0 ? raw : "0";
}

export async function fetchMelProjectsSheet(): Promise<MelProjectsDataResult> {
  const sheetId = getMelProjectsSheetId();
  const gid = getMelProjectsSheetGid();
  const fetchedAt = new Date().toISOString();

  if (!sheetId) {
    return {
      ok: false,
      error:
        "GOOGLE_MEL_PROJECTS_SHEET_ID is not set. Add it to your environment to load the MEL projects sheet.",
      fetchedAt,
      csvUrl: "",
    };
  }

  const result: SheetDataResult = await fetchGoogleSheetCsvById(sheetId, gid);
  return result as MelProjectsDataResult;
}

export function getMelProjectsCsvUrl(): string {
  const sheetId = getMelProjectsSheetId();
  if (!sheetId) return "";
  return getGoogleSheetCsvUrl(sheetId, getMelProjectsSheetGid());
}
