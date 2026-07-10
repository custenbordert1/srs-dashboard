import { isDashboardTabId } from "@/lib/recruiting-tab-groups";
import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import { P121_EXECUTIVE_TAB_ALIASES } from "@/lib/p121-executive-page-loading-navigation-fix/types";

/** Resolve `?tab=` values, including legacy executive aliases, to a dashboard tab id. */
export function normalizeDashboardTabParam(raw: string | null | undefined): DashboardTabId | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const alias = P121_EXECUTIVE_TAB_ALIASES[trimmed];
  if (alias) return alias;

  if (isDashboardTabId(trimmed)) return trimmed;
  return null;
}
