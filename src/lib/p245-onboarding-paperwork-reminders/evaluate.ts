import type { BreezyCandidate } from "@/lib/breezy-api";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  evaluateP245Eligibility,
  mapPool,
  mapWorkflowToPacketStatus,
  probePacketStatus,
} from "@/lib/p245-onboarding-paperwork-reminders/eligibility";
import { loadP245ReminderStore } from "@/lib/p245-onboarding-paperwork-reminders/store";
import { buildP245ReminderEmail } from "@/lib/p245-onboarding-paperwork-reminders/template";
import {
  P245_PHASE,
  type P245CandidateEvaluation,
  type P245MailCapability,
  type P245Metrics,
  type P245PreviewReport,
} from "@/lib/p245-onboarding-paperwork-reminders/types";
import {
  getTransactionalEmailMode,
} from "@/lib/transactional-email";

function emptyMetrics(): P245Metrics {
  return {
    evaluated: 0,
    eligible: 0,
    sent: 0,
    alreadySigned: 0,
    recentlyReminded: 0,
    invalidEmail: 0,
    deliveryFailures: 0,
    missingSignatureRequest: 0,
    activeInMel: 0,
    doNotContact: 0,
    notPaperworkSent: 0,
    packetNotOutstanding: 0,
    declined: 0,
    expired: 0,
    cancelledOrVoided: 0,
  };
}

export function accumulateP245Metrics(
  evaluations: P245CandidateEvaluation[],
  extras?: Partial<P245Metrics>,
): P245Metrics {
  const metrics = emptyMetrics();
  metrics.evaluated = evaluations.length;
  for (const row of evaluations) {
    if (row.eligible) metrics.eligible += 1;
    switch (row.skipReason) {
      case "already_signed":
        metrics.alreadySigned += 1;
        break;
      case "recently_reminded":
        metrics.recentlyReminded += 1;
        break;
      case "invalid_email":
        metrics.invalidEmail += 1;
        break;
      case "missing_signature_request":
        metrics.missingSignatureRequest += 1;
        break;
      case "active_in_mel":
        metrics.activeInMel += 1;
        break;
      case "do_not_contact":
        metrics.doNotContact += 1;
        break;
      case "not_paperwork_sent":
        metrics.notPaperworkSent += 1;
        break;
      case "packet_not_outstanding":
        metrics.packetNotOutstanding += 1;
        break;
      case "declined":
        metrics.declined += 1;
        break;
      case "expired":
        metrics.expired += 1;
        break;
      case "cancelled":
      case "voided":
        metrics.cancelledOrVoided += 1;
        break;
      default:
        break;
    }
  }
  return { ...metrics, ...extras };
}

export function resolveP245MailCapability(): P245MailCapability {
  const mode = getTransactionalEmailMode();
  const hasResendKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const recruitingFromSet = Boolean(process.env.SRS_RECRUITING_FROM_EMAIL?.trim());
  const from =
    process.env.SRS_RECRUITING_FROM_EMAIL?.trim() ||
    process.env.DIRECT_DEPOSIT_FROM?.trim() ||
    process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() ||
    "recruiting@strategicretailsolutions.com";
  const replyTo =
    process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() ||
    process.env.DIRECT_DEPOSIT_REPLY_TO?.trim() ||
    from;
  // Live delivery requires explicit recruiting From — do not treat HR fallback as ready.
  const canLiveDeliver = mode === "resend" && hasResendKey && recruitingFromSet;
  let blocker: string | null = null;
  if (!canLiveDeliver) {
    const parts: string[] = [];
    if (mode !== "resend") {
      parts.push("DIRECT_DEPOSIT_EMAIL_MODE is not 'resend' (currently log/outbox only)");
    }
    if (!hasResendKey) {
      parts.push("RESEND_API_KEY is not configured");
    }
    if (!recruitingFromSet) {
      parts.push(
        "SRS_RECRUITING_FROM_EMAIL is not configured (refusing HR DIRECT_DEPOSIT_FROM fallback for live)",
      );
    }
    blocker = parts.join("; ");
  }
  return { mode, canLiveDeliver, hasResendKey, from, replyTo, blocker };
}

function shouldConsiderWorkflow(workflow: CandidateWorkflowRecord): boolean {
  return (
    workflow.workflowStatus === "Paperwork Sent" ||
    workflow.paperworkStatus === "sent" ||
    workflow.paperworkStatus === "viewed" ||
    Boolean(workflow.signatureRequestId?.trim())
  );
}

export async function buildP245Preview(input?: {
  probeDropbox?: boolean;
  dropboxConcurrency?: number;
  nowMs?: number;
}): Promise<P245PreviewReport> {
  const nowMs = input?.nowMs ?? Date.now();
  const probeDropbox = input?.probeDropbox ?? Boolean(readDropboxSignConfig());
  const concurrency = input?.dropboxConcurrency ?? 4;

  const [workflows, ingestion, store] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadP245ReminderStore(),
  ]);
  const candidates = listIngestedCandidates(ingestion);
  const byId = new Map(candidates.map((c) => [c.candidateId, c]));

  const considered = Object.values(workflows).filter(shouldConsiderWorkflow);

  // Pass 1: workflow-only classification (cheap).
  const preliminary = considered.map((workflow) => {
    const candidate: BreezyCandidate | null = byId.get(workflow.candidateId) ?? null;
    const fallback = mapWorkflowToPacketStatus(workflow);
    return {
      workflow,
      candidate,
      prelim: evaluateP245Eligibility({
        workflow,
        candidate,
        store,
        packetStatus: fallback.status,
        packetStatusSource: fallback.source,
        nowMs,
      }),
    };
  });

  // Pass 2: Dropbox probe only for rows that look outstanding (or need confirmation).
  const needsProbe = preliminary.filter((row) => {
    if (!probeDropbox) return false;
    if (!row.workflow.signatureRequestId?.trim()) return false;
    if (row.prelim.eligible) return true;
    return (
      row.prelim.skipReason === "packet_not_outstanding" ||
      row.prelim.skipReason === "already_signed" ||
      row.prelim.skipReason === "declined" ||
      row.prelim.skipReason === "expired" ||
      row.prelim.skipReason === "cancelled" ||
      row.prelim.skipReason === "voided"
    );
  });

  const probedById = new Map<
    string,
    { status: (typeof preliminary)[number]["prelim"]["packetStatus"]; source: "dropbox" | "workflow" | "none" }
  >();

  if (needsProbe.length > 0) {
    const probed = await mapPool(needsProbe, concurrency, async (row) => {
      const signatureRequestId = row.workflow.signatureRequestId!.trim();
      const result = await probePacketStatus({
        signatureRequestId,
        workflow: row.workflow,
        probeDropbox: true,
      });
      return { candidateId: row.workflow.candidateId, ...result };
    });
    for (const row of probed) {
      probedById.set(row.candidateId, { status: row.status, source: row.source });
    }
  }

  const evaluations = preliminary.map((row) => {
    const probed = probedById.get(row.workflow.candidateId);
    if (!probed) return row.prelim;
    return evaluateP245Eligibility({
      workflow: row.workflow,
      candidate: row.candidate,
      store,
      packetStatus: probed.status,
      packetStatusSource: probed.source,
      nowMs,
    });
  });

  const eligible = evaluations.filter((e) => e.eligible);
  const skipped = evaluations.filter((e) => !e.eligible);
  const metrics = accumulateP245Metrics(evaluations);
  const mail = resolveP245MailCapability();

  return {
    phase: P245_PHASE,
    generatedAt: new Date(nowMs).toISOString(),
    mode: "preview",
    mail,
    metrics,
    eligible,
    skippedSample: skipped.slice(0, 100),
    wouldSend: eligible.map((row) => {
      const emailContent = buildP245ReminderEmail({ firstName: row.firstName });
      return {
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        email: row.email!,
        signatureRequestId: row.signatureRequestId!,
        packetStatus: row.packetStatus,
        subject: emailContent.subject,
        bodyPreview: emailContent.text.slice(0, 280),
      };
    }),
  };
}
