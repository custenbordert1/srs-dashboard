import type { ExecutiveQueryId, SupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/types";

export const SUPPORTED_EXECUTIVE_QUERIES: SupportedExecutiveQuery[] = [
  {
    id: "applicants_today",
    category: "applicants",
    question: "How many applicants applied today?",
    examplePhrases: ["applicants today", "applied today", "new applicants today"],
    previewOnly: true,
  },
  {
    id: "applicants_week",
    category: "applicants",
    question: "How many applicants applied this week?",
    examplePhrases: ["applicants this week", "applied this week", "weekly applicants"],
    previewOnly: true,
  },
  {
    id: "applicants_month",
    category: "applicants",
    question: "How many applicants applied this month?",
    examplePhrases: ["applicants this month", "applied this month", "mtd applicants"],
    previewOnly: true,
  },
  {
    id: "paperwork_sent_today",
    category: "paperwork",
    question: "How many paperwork packets were sent today?",
    examplePhrases: ["paperwork sent today", "packets sent today", "sent paperwork today"],
    previewOnly: true,
  },
  {
    id: "paperwork_sent_week",
    category: "paperwork",
    question: "How many paperwork packets were sent this week?",
    examplePhrases: ["paperwork sent this week", "packets sent this week"],
    previewOnly: true,
  },
  {
    id: "paperwork_signed_today",
    category: "paperwork",
    question: "How many candidates signed paperwork today?",
    examplePhrases: ["signed paperwork today", "paperwork signed today", "signatures today"],
    previewOnly: true,
  },
];

/** Reserved for future P69.x queries — register definitions only, wire handlers separately. */
export const FUTURE_EXECUTIVE_QUERY_STUBS = [
  "ready_for_work_today",
  "candidates_in_onboarding",
  "human_review_queue",
  "workforce_recommendations",
  "markets_needing_coverage",
  "recruiter_leaderboard",
  "dm_performance",
  "open_stores",
  "capacity_planning",
  "candidate_grades",
] as const;

export function getSupportedExecutiveQuery(id: ExecutiveQueryId): SupportedExecutiveQuery | null {
  return SUPPORTED_EXECUTIVE_QUERIES.find((row) => row.id === id) ?? null;
}

export function listSupportedExecutiveQueries(): SupportedExecutiveQuery[] {
  return [...SUPPORTED_EXECUTIVE_QUERIES];
}
