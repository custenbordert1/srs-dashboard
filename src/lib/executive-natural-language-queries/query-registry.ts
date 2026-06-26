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
  {
    id: "paperwork_auto_sent_today",
    category: "paperwork",
    question: "How many paperwork packets were automatically sent today?",
    examplePhrases: ["automatically sent today", "auto sent paperwork", "auto paperwork today"],
    previewOnly: true,
  },
  {
    id: "paperwork_manual_sent_today",
    category: "paperwork",
    question: "How many paperwork packets were manually sent today?",
    examplePhrases: ["manually sent today", "manual paperwork sends"],
    previewOnly: true,
  },
  {
    id: "paperwork_failed_count",
    category: "paperwork",
    question: "Which paperwork packets failed?",
    examplePhrases: ["paperwork failed", "failed packets", "failed paperwork"],
    previewOnly: true,
  },
  {
    id: "paperwork_waiting_longest",
    category: "paperwork",
    question: "Who has been waiting the longest to sign?",
    examplePhrases: ["waiting longest", "longest to sign", "stalled signatures"],
    previewOnly: true,
  },
  {
    id: "paperwork_top_recruiter_today",
    category: "paperwork",
    question: "Which recruiter sent the most paperwork today?",
    examplePhrases: ["recruiter sent most paperwork", "top recruiter paperwork"],
    previewOnly: true,
  },
  {
    id: "paperwork_ready_for_auto",
    category: "paperwork",
    question: "How many candidates are ready for automatic paperwork?",
    examplePhrases: ["ready for automatic paperwork", "ready for auto send", "auto paperwork eligible"],
    previewOnly: true,
  },
  {
    id: "paperwork_waiting_signature",
    category: "paperwork",
    question: "How many candidates are waiting for signatures?",
    examplePhrases: ["waiting for signatures", "awaiting signature", "pending signatures"],
    previewOnly: true,
  },
  {
    id: "paperwork_blocked_auto",
    category: "paperwork",
    question: "Which candidates are blocked from automatic paperwork?",
    examplePhrases: ["blocked from automatic", "blocked paperwork", "cannot auto send"],
    previewOnly: true,
  },
  {
    id: "paperwork_oldest_pending",
    category: "paperwork",
    question: "What is the oldest pending paperwork packet?",
    examplePhrases: ["oldest pending paperwork", "oldest packet", "longest pending packet"],
    previewOnly: true,
  },
  {
    id: "paperwork_failed_today",
    category: "paperwork",
    question: "What paperwork failed today?",
    examplePhrases: ["failed today", "paperwork failed today", "what failed today"],
    previewOnly: true,
  },
];

/** Reserved for future queries — register definitions only, wire handlers separately. */
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
