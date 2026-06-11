import { isDmRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/types";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";

/** Re-resolve DM territory states from the canonical assignment map (token may be stale). */
export function refreshSessionTerritories(session: AuthSession): AuthSession {
  if (!isDmRole(session.role)) return session;
  const dmName = session.dmName?.trim() || session.name.trim();
  if (!dmName) return session;
  const territoryStates = getAssignedStatesForDm(dmName);
  if (territoryStates.length === 0) return session;
  return { ...session, territoryStates, dmName };
}
