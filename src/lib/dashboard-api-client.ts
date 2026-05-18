import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";

async function fetchJson<T>(path: string, label: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(`${label} returned HTTP ${res.status} instead of dashboard data. Refresh the page and retry.`);
  }

  const parsed = (await res.json()) as T;
  if (!res.ok) {
    throw new Error(`${label} returned HTTP ${res.status}.`);
  }

  return parsed;
}

export async function fetchRecruitingSheetData(): Promise<SheetDataResult> {
  return fetchJson<SheetDataResult>("/api/recruiting-sheet", "Recruiting sheet");
}

export async function fetchMelProjectsData(): Promise<MelProjectsDataResult> {
  return fetchJson<MelProjectsDataResult>("/api/mel-projects", "MEL projects");
}
