import type { AuthSession } from "@/lib/auth/types";
import { buildPaperworkAutomationBundle } from "@/lib/p145-controlled-paperwork-automation/load-controlled-paperwork-automation";
import { classifyPaperworkCandidatesForProduction } from "@/lib/p150-controlled-production-activation/classify-paperwork-candidates";
import type { ControlledProductionActivationSummary } from "@/lib/p150-controlled-production-activation/types";
import {
  P150_DEFAULT_MAX_SENDS,
  P150_SOURCE_PHASE,
} from "@/lib/p150-controlled-production-activation/types";
import { executeInitialPaperworkAutoSend } from "@/lib/recruiting/initial-paperwork-execution-engine";

export function isP150ControlledProductionActivationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.P150_CONTROLLED_PRODUCTION_ACTIVATION_ENABLED === "true";
}

export function getP150MaxSendsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P150_MAX_SENDS_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P150_DEFAULT_MAX_SENDS;
}

function buildRollbackRecommendation(summary: ControlledProductionActivationSummary): string {
  if (summary.failedCount > 0 || summary.stoppedOnError) {
    return "Set P150_CONTROLLED_PRODUCTION_ACTIVATION_ENABLED=false and investigate failures before re-enabling.";
  }
  if (summary.sentCount > 0 && summary.capReached) {
    return "Cap reached as designed. Monitor audit log and Dropbox Sign before raising P150_MAX_SENDS_PER_CYCLE.";
  }
  if (summary.sentCount > 0) {
    return "Monitor audit log and signature status for 24h before increasing P150_MAX_SENDS_PER_CYCLE.";
  }
  if (summary.classification.categoryCounts.READY_TO_SEND === 0) {
    return "No action required — no READY_TO_SEND candidates. Re-run classification after pipeline updates.";
  }
  return "Dry run or disabled — enable P150_CONTROLLED_PRODUCTION_ACTIVATION_ENABLED only after review.";
}

export async function executeControlledProductionActivation(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
  userEmail?: string;
}): Promise<ControlledProductionActivationSummary> {
  const classification = await classifyPaperworkCandidatesForProduction(input.session);
  const bundle = await buildPaperworkAutomationBundle(input.session);
  const maxSendsLimit = getP150MaxSendsPerCycle();
  const p150Enabled = isP150ControlledProductionActivationEnabled();
  const dryRun = input.dryRun ?? !p150Enabled;
  const liveExecution = p150Enabled && !dryRun;

  const execution = await executeInitialPaperworkAutoSend({
    contexts: bundle.contexts,
    advancements: bundle.advancements,
    auditEvents: bundle.auditEvents,
    onboardingPolicy: bundle.onboardingPolicy,
    dryRun: !liveExecution,
    autoSendEnabled: liveExecution,
    userId: input.userId ?? input.session.userId,
    userEmail: input.userEmail ?? input.session.email,
    referenceMs: Date.parse(bundle.meta.refreshedAt),
    executionLimits: liveExecution
      ? { maxSends: maxSendsLimit, stopOnFirstError: true }
      : undefined,
  });

  const readyToSend = classification.categoryCounts.READY_TO_SEND;
  const cooldownBlocked = classification.categoryCounts.COOLDOWN;

  const summary: ControlledProductionActivationSummary = {
    ...execution,
    sourcePhase: P150_SOURCE_PHASE,
    maxSendsLimit,
    capReached: execution.capReached ?? false,
    stoppedOnError: execution.stoppedOnError ?? false,
    cooldownBlocked,
    classification,
    rollbackRecommendation: "",
  };
  summary.rollbackRecommendation = buildRollbackRecommendation(summary);

  return summary;
}
