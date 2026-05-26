import type { BreezyCandidate } from "@/lib/breezy-api";
import { filterWorkflowsForSession } from "@/lib/auth/workflow-territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";

export type DmOnboardingSnapshot = {
  paperworkSent: number;
  paperworkSigned: number;
  ddNotRequested: number;
  ddRequested: number;
  ddReceived: number;
  ddApproved: number;
  awaitingDdVerification: number;
};

export function buildDmOnboardingSnapshot(
  session: AuthSession,
  workflows: CandidateWorkflowState,
  candidates: BreezyCandidate[],
): DmOnboardingSnapshot {
  const scoped = filterWorkflowsForSession(session, workflows, candidates);
  const snapshot: DmOnboardingSnapshot = {
    paperworkSent: 0,
    paperworkSigned: 0,
    ddNotRequested: 0,
    ddRequested: 0,
    ddReceived: 0,
    ddApproved: 0,
    awaitingDdVerification: 0,
  };

  for (const workflow of Object.values(scoped)) {
    if (workflow.paperworkStatus === "sent" || workflow.paperworkStatus === "viewed") {
      snapshot.paperworkSent += 1;
    }
    if (workflow.paperworkStatus === "signed") {
      snapshot.paperworkSigned += 1;
    }

    switch (workflow.directDepositStatus) {
      case "not_requested":
        snapshot.ddNotRequested += 1;
        break;
      case "requested":
        snapshot.ddRequested += 1;
        break;
      case "received":
        snapshot.ddReceived += 1;
        break;
      case "approved":
        snapshot.ddApproved += 1;
        break;
      default:
        break;
    }

    if (workflow.workflowStatus === "Awaiting DD Verification") {
      snapshot.awaitingDdVerification += 1;
    }
  }

  return snapshot;
}
