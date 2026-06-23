import { applyRecruiterActions } from "@/lib/recruiter-action-engine/apply-recruiter-actions";
import { buildRecruiterActionDecisions } from "@/lib/recruiter-action-engine/build-action-decision";
import { buildRecruiterActionMetrics } from "@/lib/recruiter-action-engine/build-action-metrics";
import type {
  RecruiterActionEngineInput,
  RecruiterActionEngineResult,
} from "@/lib/recruiter-action-engine/types";

export async function runRecruiterActionEngine(
  input: RecruiterActionEngineInput & { byUserId?: string; persist?: boolean; workflows?: Record<string, import("@/lib/candidate-workflow-types").CandidateWorkflowRecord> },
): Promise<RecruiterActionEngineResult> {
  const referenceMs = input.referenceMs ?? Date.now();
  const decisions = buildRecruiterActionDecisions(input.candidates, referenceMs);

  let generated = 0;
  if (input.persist !== false && input.workflows) {
    const workflows = { ...input.workflows };
    const records = await applyRecruiterActions({
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
  const metrics = buildRecruiterActionMetrics({
    candidates: input.candidates,
    decisions,
    generated,
    referenceMs,
  });

  return { decisions, generated, skipped, metrics };
}
