import type { ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { SUPPORTED_EXECUTIVE_QUERIES } from "@/lib/executive-natural-language-queries/query-registry";

function normalizeQueryText(text: string): string {
  return text.toLowerCase().replace(/[?.,!]/g, "").replace(/\s+/g, " ").trim();
}

const QUERY_MATCHERS: Array<{ id: ExecutiveQueryId; patterns: RegExp[] }> = [
  {
    id: "applicants_today",
    patterns: [/applicants?.*today/, /applied today/, /how many applicants today/],
  },
  {
    id: "applicants_week",
    patterns: [/applicants?.*(this )?week/, /applied (this )?week/, /weekly applicants/],
  },
  {
    id: "applicants_month",
    patterns: [/applicants?.*(this )?month/, /applied (this )?month/, /mtd applicants/],
  },
  {
    id: "paperwork_sent_today",
    patterns: [/paperwork.*sent today/, /packets? sent today/, /sent paperwork today/],
  },
  {
    id: "paperwork_sent_week",
    patterns: [/paperwork.*sent (this )?week/, /packets? sent (this )?week/],
  },
  {
    id: "paperwork_signed_today",
    patterns: [/signed paperwork today/, /paperwork signed today/, /signatures? today/],
  },
];

export function resolveExecutiveQueryId(question: string): ExecutiveQueryId | null {
  const normalized = normalizeQueryText(question);
  if (!normalized) return null;

  for (const matcher of QUERY_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(normalized))) {
      return matcher.id;
    }
  }

  const direct = SUPPORTED_EXECUTIVE_QUERIES.find(
    (row) => normalizeQueryText(row.question) === normalized || row.id === normalized,
  );
  return direct?.id ?? null;
}

export function resolveExecutiveQueryFromText(question: string): {
  queryId: ExecutiveQueryId | null;
  normalizedQuestion: string;
} {
  return {
    queryId: resolveExecutiveQueryId(question),
    normalizedQuestion: normalizeQueryText(question),
  };
}
