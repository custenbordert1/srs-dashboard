import type { SheetRow } from "@/lib/google-sheet-csv";

export type PriorityLevel = "critical" | "watch" | "healthy" | "new";

export type AutomationRecommendation =
  | "Create post"
  | "Keep active"
  | "Review for repost"
  | "Close or pause";

export type PostAutomationQueueRow = {
  manager: string;
  jobTitle: string;
  city: string;
  state: string;
  status: string;
  applicantCount: number;
  createdDate: Date | null;
  createdDateDisplay: string;
  ageDays: number | null;
  priority: PriorityLevel;
  recommendation: AutomationRecommendation;
};

const MANAGER_ALIASES = ["manager", "hiring manager", "hm", "recruiting manager"];
const TITLE_ALIASES = ["job title", "title", "role", "position", "job"];
const CITY_ALIASES = ["city"];
const STATE_ALIASES = ["state", "st"];
const STATUS_ALIASES = ["status", "job status", "req status"];
const APPLICANT_ALIASES = ["applicant count", "applicants", "# applicants", "applications", "apps"];
const CREATED_ALIASES = ["created date", "created", "date created", "opened", "open date", "posted"];

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export type ResolvedSheetColumns = {
  manager?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  status?: string;
  applicantCount?: string;
  createdDate?: string;
  missingCritical: string[];
};

/** Maps semantic field → sheet header key actually present on rows */
function resolveHeaders(headers: string[]): ResolvedSheetColumns {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }

  function pick(aliases: string[]): string | undefined {
    for (const alias of aliases) {
      const direct = set.get(normHeader(alias));
      if (direct) return direct;
    }
    for (const h of headers) {
      const n = normHeader(h);
      for (const alias of aliases) {
        if (n === normHeader(alias)) return h;
        if (n.includes(normHeader(alias)) || normHeader(alias).includes(n)) return h;
      }
    }
    return undefined;
  }

  const manager = pick(MANAGER_ALIASES);
  const jobTitle = pick(TITLE_ALIASES);
  const city = pick(CITY_ALIASES);
  const state = pick(STATE_ALIASES);
  const status = pick(STATUS_ALIASES);
  const applicantCount = pick(APPLICANT_ALIASES);
  const createdDate = pick(CREATED_ALIASES);

  const missingCritical: string[] = [];
  if (!status) missingCritical.push("Status");

  return {
    manager,
    jobTitle,
    city,
    state,
    status,
    applicantCount,
    createdDate,
    missingCritical,
  };
}

export function parseApplicantCount(raw: string): number {
  const n = Number.parseInt(String(raw).replace(/,/g, "").trim(), 10);
  return Number.isFinite(n) && !Number.isNaN(n) ? Math.max(0, n) : 0;
}

/** Google CSV may export ISO, locale dates, or spreadsheet serial numbers */
export function parseCreatedDate(raw: string): Date | null {
  const s = String(raw).trim();
  if (!s) return null;

  const serialMatch = /^(\d{5,6})(?:\.(\d+))?$/.exec(s);
  if (serialMatch) {
    const whole = Number.parseInt(serialMatch[1]!, 10);
    if (whole > 20000 && whole < 200000) {
      const epoch = Date.UTC(1899, 11, 30);
      const ms = epoch + whole * 24 * 60 * 60 * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }

  const asNum = Number(s);
  if (Number.isFinite(asNum) && Number.isInteger(asNum) && asNum > 30000 && asNum < 200000) {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + asNum * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const mm = Number.parseInt(slash[1]!, 10);
    const dd = Number.parseInt(slash[2]!, 10);
    const yyyy = Number.parseInt(slash[3]!, 10);
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function calendarAgeDays(from: Date, to = new Date()): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function priorityAndRecommendation(
  applicants: number,
  ageDays: number | null,
): { priority: PriorityLevel; recommendation: AutomationRecommendation } {
  if (applicants > 0) {
    return { priority: "healthy", recommendation: "Keep active" };
  }

  if (ageDays === null) {
    return { priority: "critical", recommendation: "Close or pause" };
  }

  if (ageDays > 7) {
    return { priority: "critical", recommendation: "Close or pause" };
  }

  if (ageDays >= 3 && ageDays <= 7) {
    return { priority: "watch", recommendation: "Review for repost" };
  }

  return { priority: "new", recommendation: "Create post" };
}

function getCell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return row[key] ?? "";
}

function statusMatchesQueue(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === "open" || v === "requested";
}

export function buildPostAutomationQueue(
  rows: SheetRow[],
  headers: string[],
): { rows: PostAutomationQueueRow[]; missingColumns: string[] } {
  const map = resolveHeaders(headers);
  const missingColumns = [...map.missingCritical];
  if (!map.jobTitle && !missingColumns.includes("Job Title")) missingColumns.push("Job Title");

  if (!map.status) {
    return { rows: [], missingColumns };
  }

  const out: PostAutomationQueueRow[] = [];

  for (const row of rows) {
    const statusRaw = getCell(row, map.status);
    if (!statusMatchesQueue(statusRaw)) continue;

    const applicantCount = parseApplicantCount(getCell(row, map.applicantCount));
    const createdRaw = getCell(row, map.createdDate);
    const createdDate = parseCreatedDate(createdRaw);
    const ageDays = createdDate ? calendarAgeDays(createdDate) : null;

    const { priority, recommendation } = priorityAndRecommendation(applicantCount, ageDays);

    let createdDateDisplay = createdRaw || "—";
    if (createdDate) {
      try {
        createdDateDisplay = new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
        }).format(createdDate);
      } catch {
        createdDateDisplay = createdRaw || "—";
      }
    }

    out.push({
      manager: getCell(row, map.manager) || "—",
      jobTitle: getCell(row, map.jobTitle) || "—",
      city: getCell(row, map.city) || "—",
      state: getCell(row, map.state) || "—",
      status: statusRaw.trim() || "—",
      applicantCount,
      createdDate,
      createdDateDisplay,
      ageDays,
      priority,
      recommendation,
    });
  }

  const priorityRank: Record<PriorityLevel, number> = {
    critical: 0,
    watch: 1,
    new: 2,
    healthy: 3,
  };

  out.sort((a, b) => {
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    const ta = a.createdDate?.getTime() ?? 0;
    const tb = b.createdDate?.getTime() ?? 0;
    return ta - tb;
  });

  return { rows: out, missingColumns };
}
