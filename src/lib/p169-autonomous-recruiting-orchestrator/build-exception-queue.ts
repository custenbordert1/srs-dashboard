import { loadP169OrchestratorState } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-store";
import {
  P169_SOURCE_PHASE,
  type P169ExceptionQueueReport,
} from "@/lib/p169-autonomous-recruiting-orchestrator/types";

const EXCEPTION_CATEGORIES: Record<string, string> = {
  "Candidate Duplicate": "Possible duplicate",
  "Manual Review": "Low confidence / manual review",
  "Request Missing Documents": "Missing required information",
  "Review Questionnaire": "Unexpected classification",
  "Escalate To DM": "Workflow inconsistency",
};

function categorizeException(evaluation: {
  p157Action: string;
  blockingFactors: string[];
}): string {
  if (evaluation.p157Action === "Candidate Duplicate") return "Possible duplicate";
  if (evaluation.blockingFactors.some((f) => f.includes("Confidence"))) {
    return "Low confidence";
  }
  if (evaluation.p157Action === "Request Missing Documents") return "Missing data";
  if (evaluation.p157Action === "Review Questionnaire") return "Unexpected classification";
  if (evaluation.p157Action === "Escalate To DM") return "Workflow inconsistency";
  if (evaluation.p157Action === "Manual Review") return "Manual review required";
  return "Other exception";
}

export async function buildP169ExceptionQueue(): Promise<P169ExceptionQueueReport> {
  const state = await loadP169OrchestratorState();
  const exceptions = state.lastCandidateEvaluations.filter(
    (e) => e.outcome === "NEEDS_MANUAL_REVIEW",
  );

  const categoryCounts = new Map<string, number>();
  for (const row of exceptions) {
    const category = categorizeException(row);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const byCategory = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const warnings: string[] = [];
  if (exceptions.length === 0) {
    warnings.push("No exceptions from the last orchestrator cycle — run a cycle or wait for the next interval.");
  }
  if (exceptions.length > state.config.exceptionThreshold) {
    warnings.push(
      `Exception count ${exceptions.length} exceeds threshold ${state.config.exceptionThreshold}.`,
    );
  }

  return {
    sourcePhase: P169_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    totalExceptions: exceptions.length,
    byCategory,
    exceptions,
    lastCycleAt: state.lastCycleAt,
    warnings,
  };
}

export { EXCEPTION_CATEGORIES };
