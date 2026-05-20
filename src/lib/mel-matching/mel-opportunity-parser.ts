import type { MelProjectRow } from "@/lib/mel-projects-sheet";
import {
  isCompletedStoreCallStatus,
  resolveMelProjectColumnKeys,
} from "@/lib/mel-projects-metrics";
import type { MelOpportunity, MelOpportunityPriority } from "@/lib/mel-matching/matching-engine-types";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const CITY_ALIASES = ["city", "location city", "store city"];
const ADDRESS_ALIASES = ["address", "store address", "location address", "street"];
const CLIENT_ALIASES = ["client", "retailer", "banner", "customer"];
const PRIORITY_ALIASES = ["priority", "urgency", "tier"];

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }
  for (const alias of aliases) {
    const direct = set.get(normHeader(alias));
    if (direct) return direct;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n === a || n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

function cell(row: MelProjectRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function inferClient(projectName: string, storeCall: string, storeName: string): string {
  const haystack = `${projectName} ${storeCall} ${storeName}`.toLowerCase();
  const retailers = [
    "walmart",
    "target",
    "kroger",
    "albertsons",
    "publix",
    "costco",
    "sam's",
    "dollar general",
    "cvs",
    "walgreens",
  ];
  for (const retailer of retailers) {
    if (haystack.includes(retailer)) {
      return retailer
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }
  if (storeCall) return storeCall.split(/[-–|]/)[0]?.trim() || "Retail";
  return projectName.split(/[-–|]/)[0]?.trim() || "General retail";
}

function inferProjectType(projectName: string, storeCall: string): string {
  const haystack = `${projectName} ${storeCall}`.toLowerCase();
  if (haystack.includes("reset")) return "Reset";
  if (haystack.includes("osa") || haystack.includes("out of stock")) return "OSA";
  if (haystack.includes("fixture") || haystack.includes("planogram")) return "Fixture";
  if (haystack.includes("merchandis")) return "Merchandising";
  if (haystack.includes("grocery")) return "Grocery merchandising";
  return projectName.trim() || "Field program";
}

function inferPriority(
  openStatus: boolean,
  isStaffed: boolean,
  rawPriority: string,
): MelOpportunityPriority {
  const p = rawPriority.toLowerCase();
  if (p.includes("high") || p.includes("critical") || p.includes("urgent")) return "high";
  if (p.includes("low")) return "low";
  if (openStatus && !isStaffed) return "high";
  if (openStatus) return "medium";
  return "low";
}

function isAssignedRep(staffName: string): boolean {
  const name = staffName.trim().toLowerCase();
  return Boolean(name && name !== "open" && name !== "—" && name !== "unassigned" && name !== "tbd");
}

export function parseMelOpportunities(rows: MelProjectRow[]): MelOpportunity[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0] ?? {});
  const keys = resolveMelProjectColumnKeys(headers);
  const cityKey = pickColumn(headers, CITY_ALIASES);
  const addressKey = pickColumn(headers, ADDRESS_ALIASES);
  const clientKey = pickColumn(headers, CLIENT_ALIASES);
  const priorityKey = pickColumn(headers, PRIORITY_ALIASES);

  const opportunities: MelOpportunity[] = [];

  for (const row of rows) {
    const status = cell(row, keys.status);
    const completed = isCompletedStoreCallStatus(status);
    const openStatus = !completed;
    const staffName = cell(row, keys.staffName);
    const isStaffed = isAssignedRep(staffName);
    const projectName = cell(row, keys.projectName) || cell(row, keys.storeCall) || "MEL project";
    const storeCall = cell(row, keys.storeCall);
    const storeName = cell(row, keys.storeName) || storeCall;
    const state = normalizeStateCode(cell(row, keys.state));
    const city = cell(row, cityKey) || storeName;
    const storeAddress = cell(row, addressKey) || `${storeName}, ${city}, ${state}`.replace(/,\s*,/g, ",").trim();
    const client = cell(row, clientKey) || inferClient(projectName, storeCall, storeName);
    const projectType = inferProjectType(projectName, storeCall);
    const projectNo = cell(row, keys.projectNo) || storeCall || projectName;
    const opportunityId = `${projectNo}::${storeCall}::${storeName}`.toLowerCase();

    opportunities.push({
      opportunityId,
      projectName,
      client,
      storeAddress,
      storeName,
      city,
      state,
      projectType,
      priority: inferPriority(openStatus, isStaffed, cell(row, priorityKey)),
      openStatus,
      territoryOwner: cell(row, keys.manager) || "Unassigned",
      storeCall,
      projectNo,
      isStaffed,
    });
  }

  return opportunities;
}

export function filterOpportunitiesByTerritory(
  opportunities: MelOpportunity[],
  territoryStates?: string[],
): MelOpportunity[] {
  if (!territoryStates || territoryStates.length === 0) return opportunities;
  const allowed = new Set(territoryStates.map((s) => normalizeStateCode(s)));
  return opportunities.filter((o) => allowed.has(normalizeStateCode(o.state)));
}
