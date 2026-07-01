import { buildSystemPilotSafetyChecks } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-safety-gates";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { OrchestratorCandidateRecord, OrchestratorSafetyState } from "@/lib/autonomous-paperwork-orchestrator/types";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";

export async function evaluateOrchestratorSafety(input: {
  dryRun: boolean;
  confirmationPhrase?: string;
  context: LoadedPaperworkCandidates;
  candidates: OrchestratorCandidateRecord[];
}): Promise<OrchestratorSafetyState> {
  const config = loadPilotConfig();
  const registry = await loadPilotSendRegistry();

  const systemChecks = buildSystemPilotSafetyChecks({
    config,
    pilotSendCount: registry.sendCount,
    dryRun: input.dryRun,
    confirmationPhrase: input.confirmationPhrase,
  });

  const nextCandidate = input.candidates.find((candidate) => candidate.safeToSend) ?? null;
  const candidateChecks =
    nextCandidate && input.context.rowsByCandidateId.get(nextCandidate.candidateId)
      ? evaluatePilotCandidate({
          candidateId: nextCandidate.candidateId,
          row: input.context.rowsByCandidateId.get(nextCandidate.candidateId)!,
          onboarding: input.context.onboardingByCandidateId.get(nextCandidate.candidateId) ?? null,
          jobsByPositionId: input.context.jobsByPositionId,
          closedJobsByPositionId: input.context.closedJobsByPositionId,
          publishedJobs: input.context.publishedJobs,
          paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
          p100SentIds: input.context.p100SentIds,
          pilotSentIds: input.context.pilotSentIds,
          approvedMapping: input.context.approvedMappingsByCandidate.get(nextCandidate.candidateId) ?? null,
          config,
          pilotSendCount: registry.sendCount,
        }).safetyChecks
      : [];

  const checks = [
    ...systemChecks.map((check) => ({
      id: check.id,
      label: check.label,
      passed: check.passed,
      detail: check.detail,
    })),
    ...candidateChecks.map((check) => ({
      id: `candidate_${check.id}`,
      label: check.label,
      passed: check.passed,
      detail: check.detail,
    })),
  ];

  const failed = checks.filter((check) => !check.passed);
  return {
    checks,
    goNoGo: failed.length === 0 ? "GO" : "NO-GO",
    reason: failed.length === 0 ? "All orchestrator safety gates satisfied." : failed.map((check) => check.detail).join(" "),
  };
}
