import type { Kpi } from "@/lib/recruiting-sample-data";
import type { SheetRow } from "@/lib/google-sheet-csv";
import { parseApplicantCount } from "@/lib/post-automation";

/** Row counts as an “open” post for KPIs (matches post automation queue statuses). */
const OPEN_STATUS_VALUES = new Set(["open", "requested"]);

const STATUS_ALIASES = ["status", "job status", "req status"];
const APPLICANT_ALIASES = [
  "applicant count",
  "applicants",
  "# applicants",
  "applications",
  "apps",
];
const BREEZY_ALIASES = [
  "breezyhr linked",
  "breezy hr linked",
  "breezy linked",
  "breezy",
  "breezy link",
  "linked in breezy",
];
const CREATED_ALIASES = ["created date", "created", "date created", "opened", "open date", "posted"];
const MANAGER_ALIASES = ["manager", "hiring manager", "hm", "recruiting manager"];
const CITY_ALIASES = ["city"];
const STATE_ALIASES = ["state", "st"];

export type KpiSheetColumnKeys = {
  status?: string;
  applicantCount?: string;
  breezyLinked?: string;
  createdDate?: string;
  manager?: string;
  city?: string;
  state?: string;
  missingForKpis: string[];
};

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }
  for (const alias of aliases) {
    const direct = set.get(normHeader(alias));
    if (direct) return direct;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n === a || n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

export function resolveKpiSheetColumnKeys(headers: string[]): KpiSheetColumnKeys {
  const status = pickColumn(headers, STATUS_ALIASES);
  const applicantCount = pickColumn(headers, APPLICANT_ALIASES);
  const breezyLinked = pickColumn(headers, BREEZY_ALIASES);
  const createdDate = pickColumn(headers, CREATED_ALIASES);
  const manager = pickColumn(headers, MANAGER_ALIASES);
  const city = pickColumn(headers, CITY_ALIASES);
  const state = pickColumn(headers, STATE_ALIASES);

  const missingForKpis: string[] = [];
  if (!status) missingForKpis.push("Status");
  if (!applicantCount) missingForKpis.push("Applicant Count");
  if (!breezyLinked) missingForKpis.push("BreezyHR Linked");

  return {
    status,
    applicantCount,
    breezyLinked,
    createdDate,
    manager,
    city,
    state,
    missingForKpis,
  };
}

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return row[key] ?? "";
}

export function isOpenPostStatus(raw: string): boolean {
  return OPEN_STATUS_VALUES.has(raw.trim().toLowerCase());
}

/** Non-empty truthy values and URLs count as linked; explicit negatives do not. */
export function parseBreezyLinked(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return false;
  if (
    ["no", "n", "false", "0", "unlinked", "none", "-", "—", "n/a", "na", "pending"].includes(v)
  )
    return false;
  if (["yes", "y", "true", "1", "x", "linked", "✓", "check", "done"].includes(v)) return true;
  if (/^https?:\/\//i.test(raw.trim())) return true;
  return false;
}

export type SheetKpiSnapshot = {
  openPosts: number;
  totalApplicants: number;
  zeroApplicantPosts: number;
  breezyLinkedPercent: number | null;
  breezyLinkedCount: number;
  columnHints: string;
};

export function computeSheetKpiSnapshot(
  rows: SheetRow[],
  headers: string[],
): SheetKpiSnapshot {
  const keys = resolveKpiSheetColumnKeys(headers);

  if (!keys.status || !keys.applicantCount) {
    return {
      openPosts: 0,
      totalApplicants: 0,
      zeroApplicantPosts: 0,
      breezyLinkedPercent: null,
      breezyLinkedCount: 0,
      columnHints:
        keys.missingForKpis.length > 0
          ? `Missing: ${keys.missingForKpis.join(", ")}`
          : "Could not map sheet columns",
    };
  }

  let openPosts = 0;
  let totalApplicants = 0;
  let zeroApplicantPosts = 0;
  let breezyLinkedCount = 0;

  for (const row of rows) {
    const statusRaw = cell(row, keys.status);
    if (!isOpenPostStatus(statusRaw)) continue;

    openPosts += 1;
    const applicants = parseApplicantCount(cell(row, keys.applicantCount));
    totalApplicants += applicants;
    if (applicants === 0) zeroApplicantPosts += 1;

    if (keys.breezyLinked && parseBreezyLinked(cell(row, keys.breezyLinked))) {
      breezyLinkedCount += 1;
    }
  }

  const breezyLinkedPercent =
    openPosts > 0 && keys.breezyLinked ? Math.round((breezyLinkedCount / openPosts) * 1000) / 10 : null;

  const optionalMissing: string[] = [];
  if (!keys.breezyLinked) optionalMissing.push("BreezyHR Linked");
  if (!keys.createdDate) optionalMissing.push("Created Date");
  if (!keys.manager) optionalMissing.push("Manager");
  if (!keys.city) optionalMissing.push("City");
  if (!keys.state) optionalMissing.push("State");

  const columnHints =
    optionalMissing.length > 0
      ? `Optional columns not found: ${optionalMissing.join(", ")}`
      : "Mapped from Google Sheet (Open + Requested)";

  return {
    openPosts,
    totalApplicants,
    zeroApplicantPosts,
    breezyLinkedPercent,
    breezyLinkedCount,
    columnHints,
  };
}

export function sheetSnapshotToKpis(snapshot: SheetKpiSnapshot, sheetError?: string): Kpi[] {
  if (sheetError) {
    return [
      {
        id: "open-posts",
        label: "Open posts",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
      },
      {
        id: "total-applicants",
        label: "Total applicants",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
      },
      {
        id: "zero-applicant-posts",
        label: "Zero applicant posts",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
      },
      {
        id: "breezy-linked",
        label: "Breezy linked %",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
      },
    ];
  }

  const breezyValue =
    snapshot.breezyLinkedPercent === null ? "—" : `${snapshot.breezyLinkedPercent}%`;

  const breezyHint =
    snapshot.breezyLinkedPercent === null
      ? `${snapshot.columnHints} · Link rate needs BreezyHR Linked column`
      : `${snapshot.breezyLinkedCount} of ${snapshot.openPosts} open posts · ${snapshot.columnHints}`;

  return [
    {
      id: "open-posts",
      label: "Open posts",
      value: snapshot.openPosts.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Status is Open or Requested · ${snapshot.columnHints}`,
    },
    {
      id: "total-applicants",
      label: "Total applicants",
      value: snapshot.totalApplicants.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Sum of Applicant Count on open posts · ${snapshot.columnHints}`,
    },
    {
      id: "zero-applicant-posts",
      label: "Zero applicant posts",
      value: snapshot.zeroApplicantPosts.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Open posts with Applicant Count = 0 · ${snapshot.columnHints}`,
    },
    {
      id: "breezy-linked",
      label: "Breezy linked %",
      value: breezyValue,
      change: "Live",
      changeDirection: "flat",
      hint: breezyHint,
    },
  ];
}
