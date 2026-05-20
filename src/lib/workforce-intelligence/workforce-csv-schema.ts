/** Exact headers expected from active-reps-clean.csv */
export const WORKFORCE_CSV_HEADERS = [
  "Status",
  "City",
  "State",
  "Zipcode",
  "Date Of Hire",
  "SRS ID",
  "Last Login",
  "Skill Set",
] as const;

export const WORKFORCE_CSV_HEADER_SET = new Set(
  WORKFORCE_CSV_HEADERS.map((h) => h.toLowerCase()),
);

export type WorkforceCsvHeader = (typeof WORKFORCE_CSV_HEADERS)[number];
