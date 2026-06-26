import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildComparison,
  countApplicantsThisMonth,
  countApplicantsThisWeek,
  countApplicantsToday,
  countApplicantsYesterday,
  formatRefreshLabel,
  isTimestampInLastCalendarDays,
  isTimestampOnCalendarDay,
  resolveReferenceDayKeys,
} from "@/lib/executive-natural-language-queries/query-date-windows";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";

function paperworkSentAt(
  row: ScoredCandidateWorkflowRow,
  onboardingByCandidate: Map<string, CandidateOnboardingRecord>,
): string | null {
  return row.paperworkSentAt ?? onboardingByCandidate.get(row.candidateId)?.sentAt ?? null;
}

function paperworkSignedAt(row: ScoredCandidateWorkflowRow): string | null {
  return row.paperworkSignedAt;
}

function isPendingSignature(row: ScoredCandidateWorkflowRow): boolean {
  return row.paperworkStatus === "sent" || row.paperworkStatus === "viewed";
}

export function buildApplicantQueryAnswer(input: {
  queryId: Extract<ExecutiveQueryId, "applicants_today" | "applicants_week" | "applicants_month">;
  candidates: BreezyCandidate[];
  fetchedAt: string;
  sourceSystem?: string;
}): ExecutiveQueryAnswer {
  const definition = getSupportedExecutiveQuery(input.queryId)!;
  const sourceSystem = input.sourceSystem ?? "Breezy ATS (ingested cache)";

  if (input.queryId === "applicants_today") {
    const total = countApplicantsToday(input.candidates, input.fetchedAt);
    const yesterday = countApplicantsYesterday(input.candidates, input.fetchedAt);
    return {
      queryId: input.queryId,
      question: definition.question,
      category: "applicants",
      previewMode: P69_PREVIEW_MODE,
      sourceSystem,
      lastRefreshedAt: input.fetchedAt,
      total,
      metrics: { total, yesterday },
      comparison: buildComparison(total, yesterday, "Yesterday"),
      summary: `${total} applicant${total === 1 ? "" : "s"} applied today.`,
    };
  }

  if (input.queryId === "applicants_week") {
    const total = countApplicantsThisWeek(input.candidates, input.fetchedAt);
    return {
      queryId: input.queryId,
      question: definition.question,
      category: "applicants",
      previewMode: P69_PREVIEW_MODE,
      sourceSystem,
      lastRefreshedAt: input.fetchedAt,
      total,
      metrics: { total, daysInWindow: 7 },
      comparison: null,
      summary: `${total} applicant${total === 1 ? "" : "s"} applied in the last 7 calendar days.`,
    };
  }

  const total = countApplicantsThisMonth(input.candidates, input.fetchedAt);
  return {
    queryId: input.queryId,
    question: definition.question,
    category: "applicants",
    previewMode: P69_PREVIEW_MODE,
    sourceSystem,
    lastRefreshedAt: input.fetchedAt,
    total,
    metrics: { total },
    comparison: null,
    summary: `${total} applicant${total === 1 ? "" : "s"} applied month-to-date.`,
  };
}

export function buildPaperworkQueryAnswer(input: {
  queryId: Extract<ExecutiveQueryId, "paperwork_sent_today" | "paperwork_sent_week" | "paperwork_signed_today">;
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  fetchedAt: string;
  sourceSystem?: string;
}): ExecutiveQueryAnswer {
  const definition = getSupportedExecutiveQuery(input.queryId)!;
  const sourceSystem = input.sourceSystem ?? "Workflow + onboarding records (read-only)";
  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );
  const { todayKey } = resolveReferenceDayKeys(input.fetchedAt);

  if (input.queryId === "paperwork_sent_today") {
    const sentToday = input.candidates.filter((row) =>
      isTimestampOnCalendarDay(paperworkSentAt(row, onboardingByCandidate), todayKey),
    ).length;
    const signedToday = input.candidates.filter((row) =>
      isTimestampOnCalendarDay(paperworkSignedAt(row), todayKey),
    ).length;
    const pending = input.candidates.filter((row) => isPendingSignature(row)).length;

    return {
      queryId: input.queryId,
      question: definition.question,
      category: "paperwork",
      previewMode: P69_PREVIEW_MODE,
      sourceSystem,
      lastRefreshedAt: input.fetchedAt,
      total: sentToday,
      metrics: { sent: sentToday, signed: signedToday, pending },
      comparison: null,
      summary: `${sentToday} paperwork packet${sentToday === 1 ? "" : "s"} sent today.`,
    };
  }

  if (input.queryId === "paperwork_sent_week") {
    const sentWeek = input.candidates.filter((row) =>
      isTimestampInLastCalendarDays(paperworkSentAt(row, onboardingByCandidate), input.fetchedAt, 7),
    ).length;
    return {
      queryId: input.queryId,
      question: definition.question,
      category: "paperwork",
      previewMode: P69_PREVIEW_MODE,
      sourceSystem,
      lastRefreshedAt: input.fetchedAt,
      total: sentWeek,
      metrics: { sent: sentWeek, daysInWindow: 7 },
      comparison: null,
      summary: `${sentWeek} paperwork packet${sentWeek === 1 ? "" : "s"} sent in the last 7 calendar days.`,
    };
  }

  const signedToday = input.candidates.filter((row) =>
    isTimestampOnCalendarDay(paperworkSignedAt(row), todayKey),
  ).length;

  return {
    queryId: input.queryId,
    question: definition.question,
    category: "paperwork",
    previewMode: P69_PREVIEW_MODE,
    sourceSystem,
    lastRefreshedAt: input.fetchedAt,
    total: signedToday,
    metrics: { signed: signedToday },
    comparison: null,
    summary: `${signedToday} candidate${signedToday === 1 ? "" : "s"} signed paperwork today.`,
  };
}

export function buildExecutiveQueryCards(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  fetchedAt: string;
}) {
  const applicantsToday = buildApplicantQueryAnswer({
    queryId: "applicants_today",
    candidates: input.candidates,
    fetchedAt: input.fetchedAt,
  });
  const paperworkToday = buildPaperworkQueryAnswer({
    queryId: "paperwork_sent_today",
    candidates: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    fetchedAt: input.fetchedAt,
  });

  return [
    {
      id: "applicants_today" as const,
      title: "Applicants Today",
      previewMode: P69_PREVIEW_MODE,
      sourceSystem: applicantsToday.sourceSystem,
      lastRefreshedAt: input.fetchedAt,
      lastRefreshedLabel: formatRefreshLabel(input.fetchedAt),
      primaryValue: applicantsToday.total,
      primaryLabel: "Applicants",
      comparison: applicantsToday.comparison,
      lines: applicantsToday.comparison
        ? [{ label: applicantsToday.comparison.label, value: applicantsToday.comparison.value }]
        : [],
    },
    {
      id: "paperwork_today" as const,
      title: "Paperwork Today",
      previewMode: P69_PREVIEW_MODE,
      sourceSystem: paperworkToday.sourceSystem,
      lastRefreshedAt: input.fetchedAt,
      lastRefreshedLabel: formatRefreshLabel(input.fetchedAt),
      primaryValue: paperworkToday.metrics.sent ?? 0,
      primaryLabel: "Sent",
      comparison: null,
      lines: [
        { label: "Sent", value: paperworkToday.metrics.sent ?? 0 },
        { label: "Signed", value: paperworkToday.metrics.signed ?? 0 },
        { label: "Pending", value: paperworkToday.metrics.pending ?? 0 },
      ],
    },
  ];
}
