import * as XLSX from "xlsx";
import {
  cellNumber,
  cellString,
  cityStateFromPositionName,
  isApplicantYes,
  normalizeState,
  parseCityState,
} from "@/lib/open-stores-paperwork-send/normalize";
import {
  BREEZY_POSTS_SHEET,
  OPENS_SHEET,
  type BreezyPostRow,
  type OpenStoreRow,
} from "@/lib/open-stores-paperwork-send/types";

function requireSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const sheet = wb.Sheets[name];
  if (!sheet) {
    throw new Error(
      `Missing sheet "${name}". Available: ${wb.SheetNames.join(", ") || "(none)"}`,
    );
  }
  return sheet;
}

export function parseOpensSheet(rawRows: Record<string, unknown>[]): OpenStoreRow[] {
  return rawRows.map((raw, index) => {
    const city = cellString(raw["City"] ?? raw["city"]);
    const state = normalizeState(
      cellString(raw["State/Province"] ?? raw["State"] ?? raw["state"]),
    );
    const applicantYesNo = cellString(
      raw["Applicant (Yes/No)"] ?? raw["Applicant"] ?? raw["Applicants"],
    );
    return {
      rowNumber: index + 2,
      storeCall: cellString(raw["Store Call"]),
      projectNo: cellString(raw["Project No"] ?? raw["Project Number"]),
      projectName: cellString(raw["Project Name"]),
      districtManager: cellString(raw["District Manager"]),
      locationName: cellString(raw["Location Name"]),
      locationNumber: cellString(raw["Location Number"]),
      address: cellString(raw["Address"]),
      city,
      state,
      postalCode: cellString(raw["Postal Code"] ?? raw["Zip"] ?? raw["ZIP"]),
      startDate: cellString(raw["Start Date"]),
      endDate: cellString(raw["End Date"]),
      staffName: cellString(raw["Staff Name"]),
      applicantYesNo,
      applicantCount: cellNumber(raw["How many if yes"] ?? raw["Applicants Count"]),
      hasApplicants: isApplicantYes(applicantYesNo),
    };
  });
}

export function parseBreezyPostsSheet(rawRows: Record<string, unknown>[]): BreezyPostRow[] {
  return rawRows.map((raw, index) => {
    const name = cellString(raw["Name"] ?? raw["Position"] ?? raw["Job"]);
    const location = cellString(raw["Location"]);
    const fromLoc = parseCityState(location);
    const fromName = cityStateFromPositionName(name);
    return {
      rowNumber: index + 2,
      status: cellString(raw["State"] ?? raw["Status"]),
      name,
      location,
      type: cellString(raw["Type"]),
      candidates: cellNumber(raw["Candidates"]),
      created: cellString(raw["Created"]),
      lastUpdated: cellString(raw["Last Updated"]),
      hiringTeam: cellString(raw["Hiring Team"]),
      city: fromLoc.city || fromName.city,
      state: fromLoc.state || fromName.state,
    };
  });
}

export function loadTrendsWorkbook(xlsxPath: string): {
  opens: OpenStoreRow[];
  breezyPosts: BreezyPostRow[];
  sheetNames: string[];
} {
  const wb = XLSX.readFile(xlsxPath);
  const opensSheet = requireSheet(wb, OPENS_SHEET);
  const breezySheet = requireSheet(wb, BREEZY_POSTS_SHEET);
  const opensRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(opensSheet, {
    defval: "",
  });
  const breezyRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(breezySheet, {
    defval: "",
  });
  return {
    opens: parseOpensSheet(opensRaw),
    breezyPosts: parseBreezyPostsSheet(breezyRaw),
    sheetNames: wb.SheetNames,
  };
}

export function opensWithApplicants(opens: OpenStoreRow[]): OpenStoreRow[] {
  return opens.filter((row) => row.hasApplicants);
}
