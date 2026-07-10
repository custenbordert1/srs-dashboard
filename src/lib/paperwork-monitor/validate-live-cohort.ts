import {
  P107_LIVE_CANDIDATE_IDS,
  P107_LIVE_CANDIDATE_NAMES,
} from "@/lib/paperwork-monitor/live-candidate-registry";
import { getPaperworkStatusForCandidate } from "@/lib/paperwork-monitor/get-paperwork-status";
import { runPaperworkMonitorCycle } from "@/lib/paperwork-monitor/run-paperwork-monitor-cycle";

export async function validateP107LiveCohort(input?: { dryRun?: boolean }) {
  const dryRun = input?.dryRun !== false;
  const cycle = await runPaperworkMonitorCycle({
    mode: dryRun ? "dryRun" : "runOnce",
    candidateIds: [...P107_LIVE_CANDIDATE_IDS],
    byUserId: "p107-validation",
  });

  const details = await Promise.all(
    P107_LIVE_CANDIDATE_IDS.map(async (candidateId) => {
      const status = await getPaperworkStatusForCandidate(candidateId);
      return {
        candidateId,
        candidateName: P107_LIVE_CANDIDATE_NAMES[candidateId],
        status,
        cycleResult: cycle.report.candidates.find((c) => c.candidateId === candidateId) ?? null,
      };
    }),
  );

  return {
    sourcePhase: "P107",
    generatedAt: new Date().toISOString(),
    dryRun,
    cycleOk: cycle.ok,
    skippedOverlap: cycle.skippedOverlap,
    metrics: cycle.report.metrics,
    candidates: details,
    warnings: cycle.warnings,
  };
}
