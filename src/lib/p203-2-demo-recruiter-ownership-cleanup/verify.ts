import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { isDemoRecruiterName, buildProductionRecruiterSelectorOptions } from "@/lib/production-recruiter-directory";
import type { P2032CleanupAttempt, P2032PreviewRow } from "@/lib/p203-2-demo-recruiter-ownership-cleanup/types";
import { DEMO_RECRUITER_NAMES } from "@/lib/production-recruiter-directory";

export type P2032PostCleanupVerification = {
  generatedAt: string;
  recordsScanned: number;
  demoOwnedFoundBefore: number;
  automaticallyRepaired: number;
  routedToOperatorReview: number;
  unresolved: number;
  remainingDemoOwners: number;
  remainingByDemo: Record<string, number>;
  selectorDemoNames: number;
  unrelatedWorkflowChanges: number;
  lifecycleChanges: number;
  paperworkChanges: number;
  activeDemoOwners: number;
  historicalDemoOwners: number;
  targetMet: {
    selectorDemoNamesZero: boolean;
    activeDemoOwnersZeroOrDocumented: boolean;
    noLifecycleChanges: boolean;
    noPaperworkChanges: boolean;
  };
  operatorExceptions: Array<{ redactedCandidateId: string; classification: string; currentDemoOwner: string }>;
};

export function verifyP2032PostCleanup(input: {
  workflowsBefore: Record<string, CandidateWorkflowRecord>;
  workflowsAfter: Record<string, CandidateWorkflowRecord>;
  preview: P2032PreviewRow[];
  attempts: P2032CleanupAttempt[];
  rosterRecruiters: string[];
  demoOwnedFoundBefore: number;
}): P2032PostCleanupVerification {
  const remainingByDemo = Object.fromEntries(DEMO_RECRUITER_NAMES.map((n) => [n, 0])) as Record<
    string,
    number
  >;
  let remainingDemoOwners = 0;
  let activeDemoOwners = 0;
  let historicalDemoOwners = 0;

  const previewById = new Map(input.preview.map((p) => [p.candidateId, p]));

  for (const wf of Object.values(input.workflowsAfter)) {
    if (!isDemoRecruiterName(wf.assignedRecruiter)) continue;
    remainingDemoOwners += 1;
    const name = wf.assignedRecruiter.trim();
    remainingByDemo[name] = (remainingByDemo[name] ?? 0) + 1;
    const row = previewById.get(wf.candidateId);
    if (row?.statusBuckets.includes("historical") || row?.statusBuckets.includes("archived")) {
      historicalDemoOwners += 1;
    } else {
      activeDemoOwners += 1;
    }
  }

  let unrelatedWorkflowChanges = 0;
  for (const id of Object.keys(input.workflowsBefore)) {
    const before = input.workflowsBefore[id]!;
    const after = input.workflowsAfter[id];
    if (!after) continue;
    if (before.workflowStatus !== after.workflowStatus) unrelatedWorkflowChanges += 1;
    if ((before.paperworkStatus ?? null) !== (after.paperworkStatus ?? null)) {
      unrelatedWorkflowChanges += 1;
    }
  }

  const lifecycleChanges = input.attempts.reduce((n, a) => n + a.lifecycleFieldsChanged.length, 0);
  const paperworkChanges = input.attempts.reduce((n, a) => n + a.paperworkFieldsChanged.length, 0);
  const automaticallyRepaired = input.attempts.filter(
    (a) => a.ok && a.detail === "Repaired",
  ).length;
  const routedToOperatorReview = input.preview.filter((p) => p.operatorReviewRequired).length;
  const unresolved = input.preview.filter(
    (p) => p.classification === "unresolved" || p.classification === "conflicting_evidence",
  ).length;

  const selector = buildProductionRecruiterSelectorOptions({ roster: input.rosterRecruiters });
  const selectorDemoNames = selector.filter((n) => isDemoRecruiterName(n)).length;

  const operatorExceptions = input.preview
    .filter((p) => {
      const after = input.workflowsAfter[p.candidateId];
      return after && isDemoRecruiterName(after.assignedRecruiter);
    })
    .map((p) => ({
      redactedCandidateId: p.redactedCandidateId,
      classification: p.classification,
      currentDemoOwner: p.currentDemoOwner,
    }));

  return {
    generatedAt: new Date().toISOString(),
    recordsScanned: Object.keys(input.workflowsAfter).length,
    demoOwnedFoundBefore: input.demoOwnedFoundBefore,
    automaticallyRepaired,
    routedToOperatorReview,
    unresolved,
    remainingDemoOwners,
    remainingByDemo,
    selectorDemoNames,
    unrelatedWorkflowChanges,
    lifecycleChanges,
    paperworkChanges,
    activeDemoOwners,
    historicalDemoOwners,
    targetMet: {
      selectorDemoNamesZero: selectorDemoNames === 0,
      activeDemoOwnersZeroOrDocumented: activeDemoOwners === 0 || operatorExceptions.length > 0,
      noLifecycleChanges: lifecycleChanges === 0,
      noPaperworkChanges: paperworkChanges === 0,
    },
    operatorExceptions,
  };
}
