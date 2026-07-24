import { classifyOnboardingReadiness } from "@/lib/p186-5-post-sign-mel-queue/classifier";
import { readP1865Flags } from "@/lib/p186-5-post-sign-mel-queue/flags";
import { buildPostSignHealthMetrics } from "@/lib/p186-5-post-sign-mel-queue/health";
import { listMelQueue } from "@/lib/p186-5-post-sign-mel-queue/melQueue";
import {
  buildPostSignQueueItem,
  summarizePostSignQueues,
  type P1865QueueItem,
} from "@/lib/p186-5-post-sign-mel-queue/queues";
import { canViewP1865Queue } from "@/lib/p186-5-post-sign-mel-queue/rbac";
import { reconcilePostSignAndMel } from "@/lib/p186-5-post-sign-mel-queue/reconciliation";
import { resolvePostSignEvent } from "@/lib/p186-5-post-sign-mel-queue/postSignResolver";
import type {
  P1865HealthMetrics,
  P1865MelQueueItem,
  P1865ProductRole,
  P1865ReconcileFinding,
} from "@/lib/p186-5-post-sign-mel-queue/types";
import { P186_5_SOURCE_PHASE } from "@/lib/p186-5-post-sign-mel-queue/types";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export type PostSignCohortRow = {
  candidateId: string;
  displayName?: string | null;
  jobOrProjectId?: string | null;
  recruiter?: string | null;
  dm?: string | null;
  envelopeId?: string | null;
  rolloutOrSendId?: string | null;
  onboardingAssignmentId?: string | null;
  envelopeStatus?: string | null;
  templateKey?: string | null;
  productionState?: string | null;
  shadowState?: string | null;
  withdrawn?: boolean;
  archived?: boolean;
  alreadyExported?: boolean;
  melExportBlocked?: boolean;
  checklist?: Parameters<typeof classifyOnboardingReadiness>[0]["checklist"];
  requiredSignersCompleted?: boolean;
  requiredFieldsPresent?: boolean;
  declinedOrCanceled?: boolean;
  expiredOrFailed?: boolean;
  at?: string;
};

export type P1865PostSignDashboard = {
  sourcePhase: typeof P186_5_SOURCE_PHASE;
  generatedAt: string;
  readOnlyDefault: true;
  flags: ReturnType<typeof readP1865Flags>;
  role: P1865ProductRole;
  queues: ReturnType<typeof summarizePostSignQueues>;
  items: P1865QueueItem[];
  melQueue: P1865MelQueueItem[];
  health: P1865HealthMetrics;
  reconcileFindings: P1865ReconcileFinding[];
  isolation: {
    paperworkSendDisabled: true;
    melWriteDisabled: true;
    p184P185Untouched: true;
    p186NonAuthoritative: true;
    continuousAutomationDisabled: true;
  };
  safety: {
    productionWritesAttempted: 0;
    melWritesAttempted: 0;
    paperworkSendsAttempted: 0;
  };
};

export async function buildPostSignDashboard(input: {
  role: P1865ProductRole;
  cohort: PostSignCohortRow[];
  client?: SqlClient;
  forceFlags?: Partial<ReturnType<typeof readP1865Flags>>;
}): Promise<P1865PostSignDashboard> {
  const flags = readP1865Flags(input.forceFlags);
  const items: P1865QueueItem[] = [];

  if (flags.postSignObserver || flags.postSignHealthDashboard || flags.onboardingChecklist) {
    for (const row of input.cohort) {
      const resolved = resolvePostSignEvent({
        candidateId: row.candidateId,
        envelopeId: row.envelopeId ?? `env-${row.candidateId}`,
        rolloutOrSendId: row.rolloutOrSendId ?? `send-${row.candidateId}`,
        onboardingAssignmentId: row.onboardingAssignmentId ?? `oa-${row.candidateId}`,
        jobOrProjectId: row.jobOrProjectId ?? `job-${row.candidateId}`,
        envelopeStatus: row.envelopeStatus ?? null,
        sourceSystem: "validation_cohort",
        at: row.at,
        templateKey: row.templateKey,
        requiredSignersCompleted: row.requiredSignersCompleted ?? true,
        requiredFieldsPresent: row.requiredFieldsPresent ?? true,
        declinedOrCanceled: row.declinedOrCanceled,
        expiredOrFailed: row.expiredOrFailed,
      });
      if (!resolved.ok) continue;

      const classification = classifyOnboardingReadiness({
        event: resolved.event,
        productionState: row.productionState,
        shadowState: row.shadowState,
        expectedTemplateKey: row.templateKey,
        productionRecordExists: Boolean(row.productionState),
        withdrawn: row.withdrawn,
        archived: row.archived,
        onboardingAssignmentValid: true,
        alreadyExported: row.alreadyExported,
        melExportBlocked: row.melExportBlocked,
        checklist: row.checklist,
      });

      const item = buildPostSignQueueItem({
        classification,
        displayName: row.displayName,
        jobOrProject: row.jobOrProjectId,
        recruiter: row.recruiter,
        dm: row.dm,
      });
      if (item && item.queueId && canViewP1865Queue(input.role, item.queueId)) {
        items.push(item);
      }
    }
  }

  const melQueue =
    flags.melExportQueue || flags.postSignHealthDashboard
      ? await listMelQueue({ client: input.client, limit: 200 })
      : [];

  const reconcile = flags.reconciliation
    ? reconcilePostSignAndMel({
        cohort: input.cohort.map((r) => ({
          candidateId: r.candidateId,
          dropboxSignStatus: r.envelopeStatus,
          p184P185EnvelopeState: r.envelopeStatus,
          checklistComplete: (r.checklist as { signedOnboardingAgreement?: boolean } | undefined)
            ? true
            : undefined,
          productionWorkflowState: r.productionState,
          shadowState: r.shadowState,
          melQueueItems: melQueue.filter((q) => q.candidateId === r.candidateId),
          existingMelRecord: r.alreadyExported,
          jobOrProjectId: r.jobOrProjectId,
        })),
        forceFlags: { reconciliation: true },
      })
    : { findings: [] as P1865ReconcileFinding[] };

  const queues = summarizePostSignQueues(items);
  const health = buildPostSignHealthMetrics({
    queueItems: items,
    melQueue,
    reconcileFindings: reconcile.findings,
  });

  return {
    sourcePhase: P186_5_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnlyDefault: true,
    flags,
    role: input.role,
    queues,
    items,
    melQueue,
    health,
    reconcileFindings: reconcile.findings,
    isolation: {
      paperworkSendDisabled: true,
      melWriteDisabled: true,
      p184P185Untouched: true,
      p186NonAuthoritative: true,
      continuousAutomationDisabled: true,
    },
    safety: {
      productionWritesAttempted: 0,
      melWritesAttempted: 0,
      paperworkSendsAttempted: 0,
    },
  };
}
