import { applyCandidateProgressions } from "@/lib/candidate-progression-engine/apply-candidate-progressions";
import { buildCandidateProgressionDecisions } from "@/lib/candidate-progression-engine/build-progression-decision";
import { buildProgressionMetrics } from "@/lib/candidate-progression-engine/build-progression-metrics";
import type {
  CandidateProgressionEngineInput,
  CandidateProgressionEngineResult,
} from "@/lib/candidate-progression-engine/types";

export async function runCandidateProgressionEngine(
  input: CandidateProgressionEngineInput & {
    byUserId?: string;
    persist?: boolean;
    workflows?: Record<string, import("@/lib/candidate-workflow-types").CandidateWorkflowRecord>;
  },
): Promise<CandidateProgressionEngineResult> {
  const referenceMs = input.referenceMs ?? Date.now();
  const decisions = buildCandidateProgressionDecisions(input.candidates, referenceMs);

  let generated = 0;
  if (input.persist !== false && input.workflows) {
    const workflows = { ...input.workflows };
    const records = await applyCandidateProgressions({
      decisions,
      workflows,
      byUserId: input.byUserId,
    });
    generated = records.length;
    Object.assign(input.workflows, workflows);
  } else {
    generated = decisions.filter((decision) => decision.shouldPersist).length;
  }

  const skipped = decisions.length - generated;
  const metrics = buildProgressionMetrics({
    candidates: input.candidates,
    decisions,
    generated,
    referenceMs,
  });

  return { decisions, generated, skipped, metrics };
}
