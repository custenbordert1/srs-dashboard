import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { pickActiveOnboardingRecord } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { mapP157ToP169Outcome } from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";

function isP178ReadyCandidate(input: {
  p152Eligible: boolean;
  p157Action: string | null;
  p169Outcome: string | null;
  workflowStatus: string | null;
}): boolean {
  return (
    input.p152Eligible &&
    input.p157Action === "Send Paperwork" &&
    input.p169Outcome === "AUTO_SEND_PAPERWORK" &&
    input.workflowStatus === "Paperwork Needed"
  );
}

export async function resolveP178ReadyCandidateIds(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
}): Promise<string[]> {
  const [cohort, onboardingRecords, p169Config] = await Promise.all([
    loadDecisionCohort(),
    listAllCandidateOnboardingRecords().catch(() => []),
    Promise.resolve(resolveP169EnvConfig()),
  ]);

  const dashboard = buildDecisionDashboardFromCohort(cohort);
  const decisionsById = new Map(dashboard.decisions.map((d) => [d.candidateId, d]));

  const ready: string[] = [];
  for (const candidate of input.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    const onboarding = pickActiveOnboardingRecord(onboardingRecords, candidate.candidateId);
    const row = buildScoredWorkflowRow(candidate, workflow, { job: undefined });
    const p152 = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents: cohort.auditEvents,
    });
    const p157 = decisionsById.get(candidate.candidateId) ?? null;
    const p169 = p157
      ? mapP157ToP169Outcome(p157, p169Config.minimumConfidence, null)
      : null;

    if (
      isP178ReadyCandidate({
        p152Eligible: !p152.blocked,
        p157Action: p157?.action ?? null,
        p169Outcome: p169?.outcome ?? null,
        workflowStatus: workflow?.workflowStatus ?? null,
      })
    ) {
      ready.push(candidate.candidateId);
    }
  }

  return ready;
}
