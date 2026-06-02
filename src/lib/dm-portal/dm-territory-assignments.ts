/**
 * Canonical DM ↔ state assignments for the DM portal foundation.
 * Single source of truth; `dm-territory-map` derives its lookup table from here.
 */
export const DM_TERRITORY_ASSIGNMENTS = {
  "Amy Harp": ["CO", "KS", "MO", "NE", "OK", "TX"],
  "Mindie Rodriguez": ["DC", "DE", "MD", "NJ", "PA", "VA", "WV"],
  "Erin Boatright": ["AL", "FL", "GA", "NC", "SC", "LA", "MS"],
  "Lori VandeWiele": ["TN", "AR", "IA", "IN", "KY", "WI", "MN", "ND", "SD"],
  "Melissa O'Connor": ["CT", "MA", "ME", "NH", "NY", "RI", "VT"],
  "Shelly Debellis": ["AK", "AZ", "CA", "HI", "ID", "NM", "NV", "UT", "WY"],
  "Trista Thomas": ["MI", "OR", "WA", "IL"],
} as const;

export type DmTerritoryAssignmentName = keyof typeof DM_TERRITORY_ASSIGNMENTS;

export const DM_PORTAL_DISTRICT_MANAGERS = Object.keys(
  DM_TERRITORY_ASSIGNMENTS,
) as DmTerritoryAssignmentName[];
