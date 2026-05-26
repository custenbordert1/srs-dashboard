import { DISTRICT_MANAGERS, getAssignedStatesForDm } from "@/lib/dm-territory-map";

function slugifyDmEmail(dmName: string): string {
  return `${dmName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")}@srsmerchandising.com`;
}

export type MockDmLogin = {
  dmName: string;
  email: string;
  territoryStates: string[];
  stateCount: number;
};

export const MOCK_DM_LOGINS: MockDmLogin[] = DISTRICT_MANAGERS.map((dmName) => {
  const territoryStates = getAssignedStatesForDm(dmName);
  return {
    dmName,
    email: slugifyDmEmail(dmName),
    territoryStates,
    stateCount: territoryStates.length,
  };
});

export function isMockDmLoginEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.ENABLE_MOCK_DM_LOGIN?.trim().toLowerCase() === "true";
}
