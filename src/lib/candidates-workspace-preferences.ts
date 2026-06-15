export type CandidateFocusMode = "all" | "my-work";

export type CandidateTableDensity = "compact" | "comfortable";

export type CandidateSummaryStripFilterId =
  | "all"
  | "assigned"
  | "needs-follow-up"
  | "paperwork"
  | "ready-mel"
  | "unassigned";

export type CandidatesWorkspaceSectionId =
  | "analytics"
  | "workflow-buckets"
  | "dd-backfill"
  | "operational-snapshot";

export type CandidatesWorkspacePreferences = {
  focusMode: CandidateFocusMode;
  tableDensity: CandidateTableDensity;
  sections: Partial<Record<CandidatesWorkspaceSectionId, boolean>>;
};

export const CANDIDATE_TABLE_ROW_HEIGHT_PX: Record<CandidateTableDensity, number> = {
  compact: 56,
  comfortable: 80,
};

export const CANDIDATE_TABLE_IDENTITY_COL_PERCENT: Record<CandidateTableDensity, string> = {
  compact: "36%",
  comfortable: "44%",
};

const STORAGE_KEY = "srs-dashboard:candidates-workspace:v1";

const DEFAULT_PREFERENCES: CandidatesWorkspacePreferences = {
  focusMode: "all",
  tableDensity: "comfortable",
  sections: {},
};

function isFocusMode(value: unknown): value is CandidateFocusMode {
  return value === "all" || value === "my-work";
}

function isTableDensity(value: unknown): value is CandidateTableDensity {
  return value === "compact" || value === "comfortable";
}

function isSectionId(value: string): value is CandidatesWorkspaceSectionId {
  return (
    value === "analytics" ||
    value === "workflow-buckets" ||
    value === "dd-backfill" ||
    value === "operational-snapshot"
  );
}

export function readCandidatesWorkspacePreferences(): CandidatesWorkspacePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<CandidatesWorkspacePreferences>;
    const sections: Partial<Record<CandidatesWorkspaceSectionId, boolean>> = {};
    if (parsed.sections && typeof parsed.sections === "object") {
      for (const [key, value] of Object.entries(parsed.sections)) {
        if (isSectionId(key) && typeof value === "boolean") {
          sections[key] = value;
        }
      }
    }
    return {
      focusMode: isFocusMode(parsed.focusMode) ? parsed.focusMode : DEFAULT_PREFERENCES.focusMode,
      tableDensity: isTableDensity(parsed.tableDensity)
        ? parsed.tableDensity
        : DEFAULT_PREFERENCES.tableDensity,
      sections,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writeCandidatesWorkspacePreferences(
  preferences: CandidatesWorkspacePreferences,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

export function readSectionExpanded(
  sectionId: CandidatesWorkspaceSectionId,
  defaultOpen: boolean,
): boolean {
  const stored = readCandidatesWorkspacePreferences().sections[sectionId];
  return stored ?? defaultOpen;
}

export function persistSectionExpanded(
  sectionId: CandidatesWorkspaceSectionId,
  open: boolean,
): void {
  const current = readCandidatesWorkspacePreferences();
  writeCandidatesWorkspacePreferences({
    ...current,
    sections: { ...current.sections, [sectionId]: open },
  });
}

export function persistFocusMode(focusMode: CandidateFocusMode): void {
  const current = readCandidatesWorkspacePreferences();
  writeCandidatesWorkspacePreferences({ ...current, focusMode });
}

export function persistTableDensity(tableDensity: CandidateTableDensity): void {
  const current = readCandidatesWorkspacePreferences();
  writeCandidatesWorkspacePreferences({ ...current, tableDensity });
}
