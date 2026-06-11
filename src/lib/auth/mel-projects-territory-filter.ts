import { isAdminRole, isRecruiterRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { resolveMelProjectColumnKeys } from "@/lib/mel-projects-metrics";

function cell(row: Record<string, string>, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

export function filterMelProjectsDataForSession(
  data: MelProjectsDataResult,
  session: AuthSession,
): MelProjectsDataResult {
  if (!data.ok) return data;
  if (isAdminRole(session.role) || isRecruiterRole(session.role)) return data;

  const scoped = refreshSessionTerritories(session);
  const allowed = new Set(scoped.territoryStates.map(normalizeStateCode).filter(Boolean));
  if (allowed.size === 0) {
    return { ...data, rows: [] };
  }

  const keys = resolveMelProjectColumnKeys(data.headers);
  const filtered = data.rows.filter((row) => {
    const state = normalizeStateCode(cell(row, keys.state));
    return state.length === 2 && allowed.has(state);
  });

  return { ...data, rows: filtered };
}
