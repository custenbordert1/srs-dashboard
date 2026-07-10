import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
import {
  listIngestedCandidates,
  mergeIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { reconcileAllWorkflowsFromOnboarding } from "@/lib/workflow-onboarding-reconciliation";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type {
  BreezyCsvImportReport,
  BreezyCsvImportRowError,
  BreezyCsvNormalizedRow,
} from "@/lib/p154-breezy-csv-import/types";
import { BREEZY_CSV_HEADERS, P1545_SOURCE_PHASE } from "@/lib/p154-breezy-csv-import/types";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function candidateIdFromEmail(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 12);
}

export function parseBreezyExportDate(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return "";
  const month = match[1]!.padStart(2, "0");
  const day = match[2]!.padStart(2, "0");
  let year = match[3]!;
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
}

export function parseLocation(location: string): { city: string; state: string } {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: "", state: "" };
  if (parts.length === 1) {
    const state = normalizeStateCode(parts[0]!);
    return { city: state ? "" : parts[0]!, state: state ?? "" };
  }
  const state = normalizeStateCode(parts[parts.length - 1]!) ?? parts[parts.length - 1]!;
  const city = parts.slice(0, -1).join(", ");
  return { city, state };
}

export function parsePersonName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space <= 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

function normalizePositionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPositionMatcher(jobs: BreezyJob[]): (positionName: string) => BreezyJob | null {
  const byExact = new Map<string, BreezyJob>();
  for (const job of jobs) {
    byExact.set(normalizePositionKey(job.name), job);
  }
  const allJobs = [...jobs];

  return (positionName: string) => {
    const key = normalizePositionKey(positionName);
    if (!key) return null;
    const exact = byExact.get(key);
    if (exact) return exact;
    const contains = allJobs.filter((job) => {
      const jobKey = normalizePositionKey(job.name);
      return jobKey.includes(key) || key.includes(jobKey);
    });
    if (contains.length === 1) return contains[0]!;
    return null;
  };
}

export function toBreezyCandidate(row: BreezyCsvNormalizedRow): BreezyCandidate {
  return {
    candidateId: row.candidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    source: row.source,
    stage: row.stage,
    appliedDate: row.addedDate,
    createdDate: row.addedDate,
    addedDate: row.addedDate,
    updatedDate: row.lastActivityDate || row.addedDate,
    addedDateSource: "breezy_csv_import",
    positionId: row.positionId,
    positionName: row.positionName,
    city: row.city,
    state: row.state,
    zipCode: "",
    resumeText: "",
    hasResume: false,
  };
}

export async function loadAndNormalizeBreezyCsvFromDisk(input: {
  csvPath: string;
  existingCandidates: BreezyCandidate[];
  jobs: BreezyJob[];
}): Promise<{
  rows: BreezyCsvNormalizedRow[];
  totalRows: number;
  skipped: number;
  duplicates: number;
  rowErrors: BreezyCsvImportRowError[];
  unmatchedPositions: number;
}> {
  const csv = await readFile(input.csvPath, "utf8");
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      totalRows: 0,
      skipped: 0,
      duplicates: 0,
      rowErrors: [{ row: 0, message: "CSV must include header and at least one data row." }],
      unmatchedPositions: 0,
    };
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name.toLowerCase());
  const missing = BREEZY_CSV_HEADERS.filter((col) => index(col) < 0);
  if (missing.length > 0) {
    return {
      rows: [],
      totalRows: lines.length - 1,
      skipped: lines.length - 1,
      duplicates: 0,
      rowErrors: [{ row: 1, message: `Missing columns: ${missing.join(", ")}` }],
      unmatchedPositions: 0,
    };
  }

  const emailToCandidateId = new Map<string, string>();
  for (const candidate of input.existingCandidates) {
    const email = normalizeEmail(candidate.email ?? "");
    if (email) emailToCandidateId.set(email, candidate.candidateId);
  }

  const matchPosition = buildPositionMatcher(input.jobs);
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();
  const rows: BreezyCsvNormalizedRow[] = [];
  const rowErrors: BreezyCsvImportRowError[] = [];
  let skipped = 0;
  let duplicates = 0;
  let unmatchedPositions = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const rowNumber = i + 1;
    const cells = parseCsvLine(lines[i]!);
    const get = (col: string) => {
      const idx = index(col);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };

    const name = get("name");
    const email = normalizeEmail(get("email_address"));
    if (!email || !email.includes("@")) {
      skipped += 1;
      rowErrors.push({ row: rowNumber, message: "Missing or invalid email_address." });
      continue;
    }

    if (seenEmails.has(email)) {
      duplicates += 1;
      skipped += 1;
      continue;
    }
    seenEmails.add(email);

    const matchedExistingByEmail = emailToCandidateId.has(email);
    const candidateId = emailToCandidateId.get(email) ?? candidateIdFromEmail(email);
    if (seenIds.has(candidateId)) {
      duplicates += 1;
      skipped += 1;
      continue;
    }
    seenIds.add(candidateId);

    const positionName = get("position");
    const job = matchPosition(positionName);
    if (!job) unmatchedPositions += 1;

    const { city, state } = parseLocation(get("location"));
    const { firstName, lastName } = parsePersonName(name);

    rows.push({
      rowNumber,
      candidateId,
      firstName,
      lastName,
      email: get("email_address").trim(),
      phone: get("phone_number"),
      positionName,
      positionId: job?.jobId ?? "",
      city,
      state,
      stage: get("stage") || "Applied",
      source: get("source"),
      addedDate: parseBreezyExportDate(get("addedDate")),
      lastActivityDate: parseBreezyExportDate(get("lastActivityDate")),
      matchedExistingByEmail,
    });
  }

  return {
    rows,
    totalRows: lines.length - 1,
    skipped,
    duplicates,
    rowErrors,
    unmatchedPositions,
  };
}

export async function importBreezyCsvFromDisk(input: {
  csvPath: string;
  byUserId?: string;
}): Promise<BreezyCsvImportReport> {
  const generatedAt = new Date().toISOString();
  const storeBefore = await readIngestionStore();
  const existingCandidates = listIngestedCandidates(storeBefore);
  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];

  const parsed = await loadAndNormalizeBreezyCsvFromDisk({
    csvPath: input.csvPath,
    existingCandidates,
    jobs,
  });

  const existingIds = new Set(Object.keys(storeBefore.candidates));
  let imported = 0;
  let updated = 0;

  const breezyCandidates = parsed.rows.map(toBreezyCandidate);
  for (const candidate of breezyCandidates) {
    if (existingIds.has(candidate.candidateId)) updated += 1;
    else imported += 1;
  }

  const mergeResult = mergeIngestedCandidates(storeBefore, breezyCandidates);
  const store = {
    ...mergeResult.store,
    lastChunkAt: generatedAt,
  };
  await writeIngestionStore(store);

  const workflowState = await getCandidateWorkflowState();
  const backfill = await backfillWorkflowRecordsForCandidates({
    candidates: breezyCandidates,
    workflows: { ...workflowState },
    byUserId: input.byUserId,
  });
  const reconciled = await reconcileAllWorkflowsFromOnboarding({
    byUserId: input.byUserId,
  });

  return {
    sourcePhase: P1545_SOURCE_PHASE,
    generatedAt,
    csvPath: input.csvPath,
    totalRows: parsed.totalRows,
    imported,
    updated,
    skipped: parsed.skipped,
    duplicates: parsed.duplicates,
    rowErrors: parsed.rowErrors,
    unmatchedPositions: parsed.unmatchedPositions,
    mergedIntoStore: listIngestedCandidates(store).length,
    workflowsCreated: backfill.created,
    workflowsReconciled: reconciled.reconciled,
  };
}
