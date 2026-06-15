import type { ExecutiveProjectWarRoomRow } from "@/lib/executive-operations-center/types";

export type ProjectWarRoomFilters = {
  client: string;
  dm: string;
  state: string;
  risk: string;
};

export const DEFAULT_PROJECT_WAR_ROOM_FILTERS: ProjectWarRoomFilters = {
  client: "all",
  dm: "all",
  state: "all",
  risk: "all",
};

export function filterProjectWarRoomRows(
  rows: ExecutiveProjectWarRoomRow[],
  filters: ProjectWarRoomFilters,
): ExecutiveProjectWarRoomRow[] {
  return rows.filter((row) => {
    if (filters.client !== "all" && row.client !== filters.client) return false;
    if (filters.dm !== "all" && row.dmName !== filters.dm) return false;
    if (filters.state !== "all" && row.state !== filters.state) return false;
    if (filters.risk !== "all" && row.riskLevel !== filters.risk) return false;
    return true;
  });
}

export function projectWarRoomFilterOptions(rows: ExecutiveProjectWarRoomRow[]): {
  clients: string[];
  dms: string[];
  states: string[];
} {
  return {
    clients: [...new Set(rows.map((row) => row.client).filter(Boolean))].sort(),
    dms: [...new Set(rows.map((row) => row.dmName).filter(Boolean))].sort(),
    states: [...new Set(rows.map((row) => row.state).filter(Boolean))].sort(),
  };
}
