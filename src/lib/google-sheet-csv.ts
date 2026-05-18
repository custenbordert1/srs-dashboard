/**
 * Fetches a Google Sheet as CSV via the public export URL (no API keys).
 * The spreadsheet must be viewable by "Anyone with the link" (or published),
 * otherwise Google returns HTML and this will fail with a clear error.
 *
 * Optional env:
 * - GOOGLE_SHEET_ID — defaults to the SRS sheet linked in the project brief
 * - GOOGLE_SHEET_GID — tab id (from URL &gid=...), defaults to first tab (0)
 */

const DEFAULT_SHEET_ID = "13Mdc8kWDKxrwFXeKd55-ZCqwn0Goj4hNY4wZdtLJ9zE";
const GOOGLE_SHEET_TIMEOUT_MS = 15_000;
const GOOGLE_SHEET_NOT_FOUND_MESSAGE =
  "Google Sheet not found. Check GOOGLE_SHEET_ID, GOOGLE_SHEET_GID, GOOGLE_MEL_PROJECTS_SHEET_ID, GOOGLE_MEL_PROJECTS_SHEET_GID, and sharing settings.";
const GOOGLE_SHEET_PRIVATE_MESSAGE =
  "Google returned HTML instead of CSV. Check the spreadsheet sharing settings and confirm the sheet is viewable by anyone with the link.";

export type SheetRow = Record<string, string>;

export type SheetDataSuccess = {
  ok: true;
  headers: string[];
  rows: SheetRow[];
  fetchedAt: string;
  csvUrl: string;
};

export type SheetDataFailure = {
  ok: false;
  error: string;
  fetchedAt: string;
  csvUrl: string;
};

export type SheetDataResult = SheetDataSuccess | SheetDataFailure;

export function getGoogleSheetCsvUrl(sheetId: string, gid: string): string {
  const params = new URLSearchParams({ format: "csv", gid });
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?${params.toString()}`;
}

function getSheetId(): string {
  return process.env.GOOGLE_SHEET_ID?.trim() || DEFAULT_SHEET_ID;
}

function getSheetGid(): string {
  const raw = process.env.GOOGLE_SHEET_GID?.trim();
  return raw && raw.length > 0 ? raw : "0";
}

/**
 * RFC-style CSV parser: commas, double quotes, escaped quotes ("").
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushField();
      pushRow();
    } else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      pushField();
      pushRow();
    } else {
      field += c;
    }
  }

  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
    pushRow();
  }

  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.every((cell) => cell === "")) rows.pop();
    else break;
  }

  return rows;
}

function uniqueHeaders(raw: string[]): string[] {
  const counts = new Map<string, number>();
  return raw.map((h, index) => {
    const base = h.trim().length > 0 ? h.trim() : `Column_${index + 1}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

function rowsToObjects(matrix: string[][]): { headers: string[]; rows: SheetRow[] } {
  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = uniqueHeaders(matrix[0]!);
  const body = matrix.slice(1);
  const rows: SheetRow[] = body.map((cells) => {
    const obj: SheetRow = {};
    headers.forEach((key, j) => {
      obj[key] = cells[j] ?? "";
    });
    return obj;
  });
  return { headers, rows };
}

export async function fetchGoogleSheetCsvById(
  sheetId: string,
  gid: string = "0",
): Promise<SheetDataResult> {
  const fetchedAt = new Date().toISOString();
  const csvUrl = getGoogleSheetCsvUrl(sheetId, gid);

  try {
    const res = await fetch(csvUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/csv,text/plain,*/*",
      },
      signal: AbortSignal.timeout(GOOGLE_SHEET_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 404 || res.status === 400
            ? GOOGLE_SHEET_NOT_FOUND_MESSAGE
            : `HTTP ${res.status} from Google while fetching CSV export.`,
        fetchedAt,
        csvUrl,
      };
    }

    const text = (await res.text()).replace(/^\uFEFF/, "");
    const trimmed = text.trimStart();

    if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
      return {
        ok: false,
        error: GOOGLE_SHEET_PRIVATE_MESSAGE,
        fetchedAt,
        csvUrl,
      };
    }

    const matrix = parseCsv(text);
    if (matrix.length === 0) {
      return {
        ok: false,
        error: "CSV response was empty.",
        fetchedAt,
        csvUrl,
      };
    }

    const { headers, rows } = rowsToObjects(matrix);

    return {
      ok: true,
      headers,
      rows,
      fetchedAt,
      csvUrl,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown fetch error";
    return {
      ok: false,
      error: message,
      fetchedAt,
      csvUrl,
    };
  }
}

export async function fetchGoogleSheetAsRows(): Promise<SheetDataResult> {
  return fetchGoogleSheetCsvById(getSheetId(), getSheetGid());
}
