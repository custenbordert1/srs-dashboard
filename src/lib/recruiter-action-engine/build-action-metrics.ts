import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  RecruiterActionDecision,
  RecruiterActionMetrics,
} from "@/lib/recruiter-action-engine/types";
import { isActionDueToday, isActionOverdue } from "@/lib/recruiter-action-engine/action-sort";

export function buildRecruiterActionMetrics(input: {
  candidates: ScoredCandidateWorkflowRow[];
  decisions: RecruiterActionDecision[];
  generated: number;
  referenceMs?: number;
}): RecruiterActionMetrics {
  const referenceMs = input.referenceMs ?? Date.now();
  const today = new Date(referenceMs).toISOString().slice(0, 10);

  let overdueRecruiterActions = 0;
  let actionsDueToday = 0;
  let ageSumDays = 0;
  let ageCount = 0;
  let highPriorityCount = 0;
  let slaMet = 0;
  let slaTotal = 0;

  for (const row of input.candidates) {
    if (!row.requiredAction || row.actionType === "none") continue;
    if (row.actionDueDate) {
      if (isActionOverdue(row.actionDueDate, referenceMs)) overdueRecruiterActions += 1;
      if (isActionDueToday(row.actionDueDate, referenceMs)) actionsDueToday += 1;
      slaTotal += 1;
      if (!isActionOverdue(row.actionDueDate, referenceMs)) slaMet += 1;
    }
    if (row.actionPriority === "high") highPriorityCount += 1;
    if (row.actionGeneratedAt) {
      const generatedMs = Date.parse(row.actionGeneratedAt);
      if (!Number.isNaN(generatedMs)) {
        ageSumDays += Math.max(0, (referenceMs - generatedMs) / (24 * 60 * 60 * 1000));
        ageCount += 1;
      }
    }
  }

  if (overdueRecruiterActions === 0 && actionsDueToday === 0) {
    for (const decision of input.decisions) {
      if (!decision.shouldPersist) continue;
      if (isActionOverdue(decision.actionDueDate, referenceMs)) overdueRecruiterActions += 1;
      if (decision.actionDueDate === today) actionsDueToday += 1;
      if (decision.actionPriority === "high") highPriorityCount += 1;
    }
  }

  const totalWithActions = input.generated;

  return {
    overdueRecruiterActions,
    actionsDueToday,
    averageActionAgeDays: ageCount > 0 ? Math.round((ageSumDays / ageCount) * 10) / 10 : 0,
    recruiterSlaCompliance: slaTotal > 0 ? Math.round((slaMet / slaTotal) * 100) : 100,
    totalWithActions,
    highPriorityCount,
  };
}
