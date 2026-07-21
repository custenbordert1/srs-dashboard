import { existsSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_XLSX_BASENAME,
  DEFAULT_XLSX_BASENAME_ALT,
} from "@/lib/open-stores-paperwork-send/types";

const EXACT_NAMES = [DEFAULT_XLSX_BASENAME, DEFAULT_XLSX_BASENAME_ALT] as const;

function isTrendsApplicantsWorkbook(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) return false;
  // Ignore Excel lock / temp files
  if (fileName.startsWith("~$")) return false;
  return (
    lower === DEFAULT_XLSX_BASENAME.toLowerCase() ||
    lower === DEFAULT_XLSX_BASENAME_ALT.toLowerCase() ||
    /^trends_posts_with_applicants\.+\.xlsx$/i.test(fileName) ||
    /^trends_posts_with_applicants\.xlsx$/i.test(fileName)
  );
}

function searchDirs(cwd: string): string[] {
  const home = os.homedir();
  return [
    cwd,
    path.join(cwd, "artifacts"),
    path.join(cwd, "data"),
    path.join(cwd, "diagnostics"),
    path.join(cwd, ".data", "imports"),
    path.join(home, "Desktop"),
    path.join(home, "Downloads"),
    path.join(home, "Documents"),
  ];
}

/**
 * Resolve Trends workbook path. Prefer `--xlsx`, else search common locations
 * for both `Trends_Posts_With_Applicants..xlsx` and `.xlsx` (case-insensitive).
 * When multiple exist, prefer the newest mtime.
 */
export function resolveDefaultXlsxPath(cwd = process.cwd()): string | null {
  const found: Array<{ path: string; mtimeMs: number; exactRank: number }> = [];

  for (const dir of searchDirs(cwd)) {
    if (!existsSync(dir)) continue;

    // Fast path: exact basenames
    for (let i = 0; i < EXACT_NAMES.length; i++) {
      const candidate = path.join(dir, EXACT_NAMES[i]!);
      if (!existsSync(candidate)) continue;
      try {
        found.push({ path: candidate, mtimeMs: statSync(candidate).mtimeMs, exactRank: i });
      } catch {
        /* ignore */
      }
    }

    // Directory scan for spelling / case / extra-dot variants
    try {
      for (const entry of readdirSync(dir)) {
        if (!isTrendsApplicantsWorkbook(entry)) continue;
        const candidate = path.join(dir, entry);
        if (found.some((f) => f.path === candidate)) continue;
        try {
          found.push({ path: candidate, mtimeMs: statSync(candidate).mtimeMs, exactRank: 50 });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore unreadable dirs */
    }
  }

  if (found.length === 0) return null;
  found.sort((a, b) => {
    if (a.exactRank !== b.exactRank) return a.exactRank - b.exactRank;
    return b.mtimeMs - a.mtimeMs;
  });
  return found[0]!.path;
}

export function defaultXlsxHint(cwd = process.cwd()): string {
  return path.join(cwd, "artifacts", DEFAULT_XLSX_BASENAME);
}

export function listSearchedXlsxHints(cwd = process.cwd()): string[] {
  return searchDirs(cwd).flatMap((dir) =>
    EXACT_NAMES.map((name) => path.join(dir, name)),
  );
}
