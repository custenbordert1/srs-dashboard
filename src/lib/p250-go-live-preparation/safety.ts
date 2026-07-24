import {
  P246_BATCH_PAUSE_MS,
  P246_BATCH_SIZE,
  P246_MAX_REMINDERS,
} from "@/lib/p246-outstanding-paperwork-reminders/types";
import {
  P250_OPS_DATE,
  P250_PHASE,
  type P250ProductionSafetyReview,
} from "@/lib/p250-go-live-preparation/types";

/**
 * Production safety review of live send paths (code + ops facts).
 * Read-only — does not execute sends or mutate stores.
 */
export function buildP250ProductionSafetyReview(input: {
  dropboxTestMode: boolean | null;
  resendReady: boolean;
  productionDropboxQuotaZero: boolean;
  invalidEmailCount: number;
  missingSignatureRequestCount: number;
}): P250ProductionSafetyReview {
  const controls = [
    {
      id: "duplicate_prevention_initial",
      control: "Initial paperwork already-sent / signed exclusion",
      status: "present" as const,
      evidence:
        "P242/P243 classify sets alreadySentExclusion and signedExclusion; dry-run excluded 68 already_sent",
      residualRisk: null,
    },
    {
      id: "idempotency_reminders",
      control: "Reminder idempotency keys",
      status: "present" as const,
      evidence:
        "P246 buildP246IdempotencyKey + hasIdempotencyKey / usedIdempotencyKeys in reminder store before send",
      residualRisk:
        "Reminder store file was absent in P249 — first live run creates it; ensure durable path is writable",
    },
    {
      id: "dropbox_refresh_before_send",
      control: "Dropbox live status refresh before reminder send",
      status: "present" as const,
      evidence:
        "send.ts calls probeDropboxLiveStatus(..., { forceRefresh: true }) and skips signed/complete/ineligible",
      residualRisk: null,
    },
    {
      id: "reminder_cooldown",
      control: "Reminder cadence / cooldown",
      status: "present" as const,
      evidence: `isCadenceSatisfied + max ${P246_MAX_REMINDERS} reminders; P249 cooldown_not_met=${52}`,
      residualRisk: null,
    },
    {
      id: "signed_exclusion",
      control: "Signed / completed exclusion",
      status: "present" as const,
      evidence:
        "Eligibility + pre-send probe skip signed_before_send; P249 signed_or_completed=78",
      residualRisk: null,
    },
    {
      id: "retry_protection",
      control: "Transient retry + campaign stop on provider failures",
      status: "present" as const,
      evidence:
        "One retry after 750ms for transient errors; stopCampaign on auth/domain/429/persistence failures",
      residualRisk: "Operator must not re-run --continue-full without reviewing stopReason",
    },
    {
      id: "rate_limiting",
      control: "Batch rate limiting",
      status: "present" as const,
      evidence: `P246_BATCH_SIZE=${P246_BATCH_SIZE}, P246_BATCH_PAUSE_MS=${P246_BATCH_PAUSE_MS}`,
      residualRisk: "Resend account limits still apply; campaign stops on 429",
    },
    {
      id: "audit_logging",
      control: "Send / skip audit records",
      status: "present" as const,
      evidence:
        "P246 records sent/skips/failures with idempotencyKey, messageId, failureClass; P248 writes campaign artifacts",
      residualRisk: null,
    },
    {
      id: "transactional_safety",
      control: "Live flags + dry-run default",
      status: "present" as const,
      evidence:
        "Scripts refuse --live without --confirm-live; P243 requires dryRun=false + confirmLive + execute; P250/P249 refuse live flags",
      residualRisk: null,
    },
    {
      id: "mail_transport_gate",
      control: "Resend live delivery gate",
      status: input.resendReady ? ("present" as const) : ("missing" as const),
      evidence: input.resendReady
        ? "checkP248ResendConfiguration readyForLive=true"
        : "readyForLive=false — RESEND / mode / From / domain blockers remain",
      residualRisk: input.resendReady
        ? null
        : "Any accidental --live will stop before delivery while mailer is log/outbox",
    },
    {
      id: "dropbox_test_mode",
      control: "Dropbox testMode guard for initial packets",
      status: "operator_dependent" as const,
      evidence: `DROPBOX_SIGN_TEST_MODE / config testMode=${String(input.dropboxTestMode)}; P243 refuses live when testMode is not true`,
      residualRisk: input.productionDropboxQuotaZero
        ? "Production quota=0 — production-mode packet sends blocked; testMode packets are test envelopes"
        : null,
    },
    {
      id: "mel_write_isolation",
      control: "No automatic MEL writes in reminder/initial paths",
      status: "present" as const,
      evidence:
        "P246/P248 do not write MEL; Ready-for-MEL advancement is manual/authorized after signature verify",
      residualRisk: null,
    },
  ];

  const remainingProductionRisks = [
    ...(input.resendReady
      ? []
      : ["Live email blocked until Resend configuration FAILs are remediated"]),
    ...(input.productionDropboxQuotaZero
      ? [
          "Dropbox Sign production quota=0 — initial packet production sends blocked; use intentional testMode only",
        ]
      : []),
    ...(input.dropboxTestMode
      ? ["Dropbox testMode=true — initial packets are test envelopes until production mode is authorized and quota restored"]
      : []),
    ...(input.invalidEmailCount > 0
      ? [`${input.invalidEmailCount} invalid emails excluded from reminders — clean in Breezy before forcing`]
      : []),
    ...(input.missingSignatureRequestCount > 0
      ? [
          `${input.missingSignatureRequestCount} outstanding packets missing signatureRequestId — reconcile before chasing`,
        ]
      : []),
    "Do not enable P246 --apply-safe-corrections until reconciliation conflicts are operator-reviewed",
    "Reminder store was not present at P249 — first successful live reminder persists idempotency history; protect .data/",
    "Never pass --live without --confirm-live",
  ];

  return {
    phase: P250_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P250_OPS_DATE,
    mode: "read_only_code_and_ops_review",
    controls,
    remainingProductionRisks,
    liveWriteGuards: [
      "P250 script rejects --live / --confirm-live",
      "P249 script rejects --live / --confirm-live",
      "P248 requires --live AND --confirm-live; defaults to config+freeze only",
      "P243 execute requires dryRun=false + confirmLive=true + execute=true",
      "P246 send path skips when mail.canLiveDeliver is false when requireLiveDelivery=true",
      "P250 performs zero emails, Dropbox writes, Breezy writes, MEL writes, or DB mutations",
    ],
  };
}
