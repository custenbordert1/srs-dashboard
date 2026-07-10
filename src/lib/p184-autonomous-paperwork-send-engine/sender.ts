import type { ExecuteOnboardingSendDeps } from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { executeOnboardingSend } from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { prepareOnboardingSend } from "@/lib/autonomous-paperwork-send-engine/prepare-onboarding-send";
import { isTransientSendError } from "@/lib/candidate-onboarding-send-queue/classify-send-error";
import { isPermanentSendFailure } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import type {
  P184EngineMode,
  P184QueueItem,
  P184SendResult,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { P184_SOURCE_PHASE } from "@/lib/p184-autonomous-paperwork-send-engine/types";

export type P184SenderDeps = {
  executeOnboardingSend?: typeof executeOnboardingSend;
  prepareOnboardingSend?: typeof prepareOnboardingSend;
  sendDeps?: ExecuteOnboardingSendDeps;
};

export async function sendP184Paperwork(input: {
  item: P184QueueItem;
  mode: P184EngineMode;
  byUserId?: string;
  deps?: P184SenderDeps;
}): Promise<P184SendResult> {
  const started = Date.now();
  const { item, mode } = input;
  const prepare = input.deps?.prepareOnboardingSend ?? prepareOnboardingSend;
  const execute = input.deps?.executeOnboardingSend ?? executeOnboardingSend;

  if (mode === "dry_run") {
    return {
      ok: true,
      candidateId: item.candidateId,
      envelopeId: `dry-run-${item.idempotencyKey}`,
      sentAt: new Date().toISOString(),
      templateKey: item.templateKey,
      durationMs: Date.now() - started,
      simulated: true,
      transient: false,
      permanent: false,
      retryScheduled: false,
      error: null,
      idempotencyKey: item.idempotencyKey,
    };
  }

  try {
    const onboarding = await prepare({
      candidateId: item.candidateId,
      templateKey: item.templateKey,
      actionType: "send-paperwork",
      orchestratorRunId: P184_SOURCE_PHASE,
    });

    const result = await execute(
      {
        candidateId: item.candidateId,
        candidateName: item.candidateName,
        candidateEmail: item.candidateEmail,
        templateKey: item.templateKey,
        byUserId: input.byUserId ?? "p184-autonomous-engine",
        inFlightOnboardingId: onboarding.onboardingId,
      },
      input.deps?.sendDeps,
    );

    const durationMs = Date.now() - started;
    if (result.ok) {
      return {
        ok: true,
        candidateId: item.candidateId,
        envelopeId: result.signatureRequestId,
        sentAt: new Date().toISOString(),
        templateKey: item.templateKey,
        durationMs,
        simulated: false,
        transient: false,
        permanent: false,
        retryScheduled: false,
        error: null,
        idempotencyKey: item.idempotencyKey,
      };
    }

    const permanent = isPermanentSendFailure(result.error);
    const transient =
      !permanent &&
      (result.transient || isTransientSendError({ error: result.error, message: result.error }));
    return {
      ok: false,
      candidateId: item.candidateId,
      envelopeId: null,
      sentAt: null,
      templateKey: item.templateKey,
      durationMs,
      simulated: false,
      transient,
      permanent,
      retryScheduled: false,
      error: result.error,
      idempotencyKey: item.idempotencyKey,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = isPermanentSendFailure(message);
    const transient = !permanent && isTransientSendError({ error: err, message });
    return {
      ok: false,
      candidateId: item.candidateId,
      envelopeId: null,
      sentAt: null,
      templateKey: item.templateKey,
      durationMs: Date.now() - started,
      simulated: false,
      transient,
      permanent,
      retryScheduled: false,
      error: message,
      idempotencyKey: item.idempotencyKey,
    };
  }
}
