import type { BreezyCandidate } from "@/lib/breezy-api";
import type {
  P1933CaptureHealth,
  P1933QuestionnaireRecord,
  P1933ReconciliationSummary,
} from "@/lib/p193-3-questionnaire-capture/types";
import { writeCaptureHealthDoc } from "@/lib/p193-3-questionnaire-capture/persistence";
import { readP193Flags } from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";

export async function buildP1933CaptureHealth(input: {
  candidates: BreezyCandidate[];
  summary: P1933ReconciliationSummary;
  recordsById: Record<string, P1933QuestionnaireRecord>;
  failedFetches: number;
  lastCheckpointAt: string | null;
  p192Pid: number | null;
  p192PidAtStart: number | null;
}): Promise<P1933CaptureHealth> {
  const flags = await readP193Flags();
  const completedRecords = Object.values(input.recordsById).filter(
    (r) => r.completionStatus === "completed" && r.flatAnswers.some((a) => a.answer.trim()),
  );
  const latestBreezy = completedRecords
    .map((r) => r.completedAt || r.sourceTimestamp)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const latestLocal = completedRecords
    .map((r) => r.fetchedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  let ingestionLagMinutes: number | null = null;
  if (latestBreezy && latestLocal) {
    ingestionLagMinutes = Math.max(
      0,
      Math.round((new Date(latestLocal).getTime() - new Date(latestBreezy).getTime()) / 60_000),
    );
  }

  const unmappedVersions = [
    ...new Set(
      completedRecords
        .filter((r) => r.unmappedQuestionCount > 0 && r.questionnaireVersion)
        .map((r) => r.questionnaireVersion!)
        .filter((v) => !/master questionnaire/i.test(v)),
    ),
  ];

  const health: P1933CaptureHealth = {
    generatedAt: new Date().toISOString(),
    applicantsReceived: input.candidates.length,
    questionnairesCompletedInBreezy: input.summary.breezyQuestionnaireComplete,
    questionnairesCapturedLocally: input.candidates.filter(
      (c) => c.hasQuestionnaire || (c.questionnaireAnswers?.length ?? 0) > 0,
    ).length,
    missingCount: input.summary.missingLocally,
    latestBreezyCompletionAt: latestBreezy,
    latestLocalCaptureAt: latestLocal,
    ingestionLagMinutes,
    failedFetches: input.failedFetches,
    unmappedQuestionnaireVersions: unmappedVersions,
    lastSuccessfulBackfillOrCheckpointAt: input.lastCheckpointAt,
    p193FlagsRemainOff:
      flags.enabled === false &&
      flags.paperworkBridgeEnabled === false &&
      flags.reminderSendEnabled === false,
    reminderSendEnabled: false,
    p192Untouched: input.p192Pid != null && input.p192Pid === input.p192PidAtStart,
    p192Pid: input.p192Pid,
  };

  await writeCaptureHealthDoc(health);
  return health;
}
