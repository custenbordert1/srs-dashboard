export const DM_TERRITORY_MAP = {
  CO: "Amy Harp",
  KS: "Amy Harp",
  MO: "Amy Harp",
  NE: "Amy Harp",
  OK: "Amy Harp",
  TX: "Amy Harp",

  OH: "Mindie Rodriguez",
  PA: "Mindie Rodriguez",
  WV: "Mindie Rodriguez",
  VA: "Mindie Rodriguez",

  AL: "Erin Boatright",
  FL: "Erin Boatright",
  GA: "Erin Boatright",
  LA: "Erin Boatright",
  MS: "Erin Boatright",
  NC: "Erin Boatright",
  SC: "Erin Boatright",

  AR: "Lori VandeWiele",
  IA: "Lori VandeWiele",
  IN: "Lori VandeWiele",
  KY: "Lori VandeWiele",
  TN: "Lori VandeWiele",
  WI: "Lori VandeWiele",
  MN: "Lori VandeWiele",
  ND: "Lori VandeWiele",
  SD: "Lori VandeWiele",

  CT: "Melissa O'Connor",
  DC: "Melissa O'Connor",
  DE: "Melissa O'Connor",
  MA: "Melissa O'Connor",
  ME: "Melissa O'Connor",
  NH: "Melissa O'Connor",
  NJ: "Melissa O'Connor",
  NY: "Melissa O'Connor",
  MD: "Melissa O'Connor",
  RI: "Melissa O'Connor",
  VT: "Melissa O'Connor",

  AZ: "Shelly Debellis",
  NM: "Shelly Debellis",
  NV: "Shelly Debellis",
  UT: "Shelly Debellis",
  CA: "Shelly Debellis",
  ID: "Shelly Debellis",
  MT: "Shelly Debellis",
  WY: "Shelly Debellis",
  HI: "Shelly Debellis",
  AK: "Shelly Debellis",

  MI: "Trista Thomas",
  OR: "Trista Thomas",
  WA: "Trista Thomas",
  IL: "Trista Thomas",
} as const;

export type DistrictManager = (typeof DM_TERRITORY_MAP)[keyof typeof DM_TERRITORY_MAP];

export const DISTRICT_MANAGERS = [...new Set(Object.values(DM_TERRITORY_MAP))].sort((a, b) =>
  a.localeCompare(b),
);

export function normalizeStateCode(raw: string): string {
  const value = raw.trim().toUpperCase();
  return value.length === 2 ? value : value.slice(0, 2);
}

export function getDmForState(rawState: string): DistrictManager | undefined {
  const state = normalizeStateCode(rawState);
  return DM_TERRITORY_MAP[state as keyof typeof DM_TERRITORY_MAP];
}

export function getAssignedStatesForDm(dm: string): string[] {
  return Object.entries(DM_TERRITORY_MAP)
    .filter(([, manager]) => manager === dm)
    .map(([state]) => state)
    .sort((a, b) => a.localeCompare(b));
}

export function resolveDmName(rawManager: string, rawState: string): string {
  const manager = rawManager.trim();
  if (manager && manager !== "—" && manager.toLowerCase() !== "unassigned") return manager;
  return getDmForState(rawState) ?? "Unassigned";
}
