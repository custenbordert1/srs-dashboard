import type { P1866ProductRole } from "@/lib/p186-6-executive-recruiting-intelligence/types";
import type { UserRole } from "@/lib/auth/types";
import type { ExceptionSafeAction } from "@/lib/p186-6-executive-recruiting-intelligence/exceptions";
import { P1866_EXCEPTION_SAFE_ACTIONS } from "@/lib/p186-6-executive-recruiting-intelligence/exceptions";

export function toP1866ProductRole(sessionRole: UserRole, preferOperator = false): P1866ProductRole {
  if (sessionRole === "executive") return preferOperator ? "operator" : "executive";
  if (sessionRole === "recruiter") return "recruiter";
  if (sessionRole === "dm") return "dm";
  return "read_only_viewer";
}

export type P1866Section =
  | "funnel"
  | "health"
  | "aging"
  | "bottlenecks"
  | "scorecards"
  | "paperwork"
  | "ready_for_mel"
  | "exceptions"
  | "forecast"
  | "system_health";

const SECTION_ACCESS: Record<P1866ProductRole, ReadonlySet<P1866Section> | "all"> = {
  executive: "all",
  operator: "all",
  recruiter: new Set(["funnel", "health", "aging", "scorecards", "paperwork", "system_health"]),
  dm: new Set(["funnel", "health", "aging", "bottlenecks", "scorecards", "paperwork", "exceptions", "system_health"]),
  read_only_viewer: new Set([
    "funnel",
    "health",
    "aging",
    "bottlenecks",
    "scorecards",
    "paperwork",
    "ready_for_mel",
    "exceptions",
    "forecast",
    "system_health",
  ]),
};

export function canViewSection(role: P1866ProductRole, section: P1866Section): boolean {
  const access = SECTION_ACCESS[role];
  if (access === "all") return true;
  return access.has(section);
}

export function canPerformExceptionAction(
  role: P1866ProductRole,
  action: ExceptionSafeAction,
): boolean {
  if (!P1866_EXCEPTION_SAFE_ACTIONS.includes(action)) return false;
  if (role === "read_only_viewer") {
    return action === "open_candidate_detail" || action === "export_redacted_report";
  }
  if (role === "recruiter") {
    return action === "add_note" || action === "open_candidate_detail";
  }
  return true;
}

/** Filter scorecards to own owner for recruiter/DM. */
export function filterScorecardsForRole<T extends { owner: string; ownerType: string }>(
  role: P1866ProductRole,
  cards: T[],
  selfName?: string | null,
): T[] {
  if (role === "executive" || role === "operator" || role === "read_only_viewer") return cards;
  if (!selfName) return [];
  if (role === "recruiter") {
    return cards.filter((c) => c.ownerType === "recruiter" && c.owner === selfName);
  }
  if (role === "dm") {
    return cards.filter((c) => c.ownerType === "dm" && c.owner === selfName);
  }
  return cards;
}
