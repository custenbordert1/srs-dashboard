import type {
  P228CandidateSnapshot,
  P228DataQuality,
} from "@/lib/p228-production-readiness/types";

export function assessDataQuality(input: {
  candidates: P228CandidateSnapshot[];
  ingestionIds: string[];
  workflowIds: string[];
}): P228DataQuality {
  const ingestionSet = new Set(input.ingestionIds);
  const workflowSet = new Set(input.workflowIds);

  let recoveredIdentities = 0;
  let recoveredEmails = 0;
  let recoveredDms = 0;
  let workflowRestored = 0;
  let ingestionOnly = 0;
  let duplicates = 0;

  for (const c of input.candidates) {
    if (c.recoveredIdentity) recoveredIdentities += 1;
    if (c.recoveredEmail) recoveredEmails += 1;
    if (c.recoveredDm) recoveredDms += 1;
    if (c.listMembershipSource === "workflow_restored") workflowRestored += 1;
    if (c.isDuplicate) duplicates += 1;
  }

  for (const id of ingestionSet) {
    if (!workflowSet.has(id)) ingestionOnly += 1;
  }

  let orphanWorkflow = 0;
  for (const id of workflowSet) {
    if (!ingestionSet.has(id)) orphanWorkflow += 1;
  }

  // Score: reward recoveries and dual-membership; penalize orphans/duplicates.
  const universe = Math.max(1, new Set([...ingestionSet, ...workflowSet]).size);
  const dual = [...workflowSet].filter((id) => ingestionSet.has(id)).length;
  const dualPct = dual / universe;
  const orphanPct = orphanWorkflow / universe;
  const dupPct = duplicates / Math.max(1, input.candidates.length);
  const recoveryBoost = Math.min(
    15,
    recoveredIdentities * 2 + recoveredEmails * 2 + recoveredDms,
  );

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(55 + dualPct * 30 + recoveryBoost - orphanPct * 25 - dupPct * 40),
    ),
  );

  return {
    recoveredIdentities,
    recoveredEmails,
    recoveredDms,
    workflowRestored,
    ingestionOnly,
    duplicates,
    orphanWorkflow,
    orphanIngestion: ingestionOnly,
    score,
  };
}
