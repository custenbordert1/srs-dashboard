import type { BreezyJob } from "@/lib/breezy-api";
import { isAppliedDateInRange } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { currentMtdDateRange } from "@/lib/candidate-ingestion/mtd-candidates";
import type { HiringDecisionPreviewSnapshot } from "@/lib/autonomous-hiring-decision-engine/types";
import { P87_PREVIEW_MODE, P87_SOURCE_PHASE } from "@/lib/autonomous-hiring-decision-engine/types";
import { runHiringDecisionSimulation } from "@/lib/autonomous-hiring-decision-engine/run-hiring-decision-simulation";
import { saveHiringDecisionPreviewSnapshot } from "@/lib/autonomous-hiring-decision-engine/preview-snapshot-store";

export async function refreshHiringDecisionPreview(input: {
  rows: ScoredCandidateWorkflowRow[];
  jobsByPositionId: Map<string, BreezyJob>;
  onboardingRecords?: CandidateOnboardingRecord[];
  mtdOnly?: boolean;
  persist?: boolean;
}): Promise<HiringDecisionPreviewSnapshot> {
  const range = currentMtdDateRange();
  const mtdRangeLabel = `${range.start}..${range.end}`;
  const rows =
    input.mtdOnly === false
      ? input.rows
      : input.rows.filter((row) =>
          isAppliedDateInRange(row.appliedDate, range.start, range.end),
        );
  const onboardingByCandidateId = new Map(
    (input.onboardingRecords ?? []).map((record) => [record.candidateId, record]),
  );
  const simulation = runHiringDecisionSimulation({
    rows,
    jobsByPositionId: input.jobsByPositionId,
    onboardingByCandidateId,
    mtdRangeLabel,
  });
  const snapshot: HiringDecisionPreviewSnapshot = {
    sourcePhase: P87_SOURCE_PHASE,
    previewMode: P87_PREVIEW_MODE,
    generatedAt: simulation.generatedAt,
    simulation,
  };
  if (input.persist !== false) {
    await saveHiringDecisionPreviewSnapshot(snapshot);
  }
  return snapshot;
}
