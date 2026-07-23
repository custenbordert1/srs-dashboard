import type { BreezyCandidate } from "@/lib/breezy-api";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  resolveCandidateName,
} from "@/lib/p245-onboarding-paperwork-reminders/eligibility";
import { resolveP245MailCapability } from "@/lib/p245-onboarding-paperwork-reminders/evaluate";
import { buildP245ReminderEmail } from "@/lib/p245-onboarding-paperwork-reminders/template";
import { evaluateP246Eligibility } from "@/lib/p246-outstanding-paperwork-reminders/eligibility";
import {
  mapPool,
  probeDropboxLiveStatus,
} from "@/lib/p246-outstanding-paperwork-reminders/dropbox-status";
import { reconcileCandidateStatus } from "@/lib/p246-outstanding-paperwork-reminders/reconcile";
import { loadP246ReminderStore } from "@/lib/p246-outstanding-paperwork-reminders/store";
import {
  P246_PHASE,
  type P246CandidateEvaluation,
  type P246DashboardMetrics,
  type P246MailCapability,
  type P246Metrics,
  type P246PreviewBuckets,
  type P246PreviewReport,
  type P246ReconciliationRecord,
  type P246ReminderNumber,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

function emptyMetrics(): P246Metrics {
  return {
    evaluated: 0,
    dropboxVerified: 0,
    eligibleReminder1: 0,
    eligibleReminder2: 0,
    eligibleReminder3: 0,
    eligibleReminder4: 0,
    eligibleTotal: 0,
    signedOrCompleted: 0,
    viewedIncomplete: 0,
    pendingIncomplete: 0,
    partiallySignedIncomplete: 0,
    recentlyReminded: 0,
    cooldownNotMet: 0,
    maximumRemindersReached: 0,
    needsRecruiterFollowUp: 0,
    missingSignatureRequest: 0,
    invalidEmail: 0,
    statusConflicts: 0,
    dropboxLookupFailures: 0,
    statusUnverified: 0,
    activeInMel: 0,
    doNotContact: 0,
    packetEmailMismatch: 0,
    otherExclusions: 0,
    attempted: 0,
    sent: 0,
    deliveryFailures: 0,
    skipped: 0,
  };
}

function emptyBuckets(): P246PreviewBuckets {
  return {
    eligibleReminder1: [],
    eligibleReminder2: [],
    eligibleReminder3: [],
    eligibleReminder4: [],
    signedOrCompleted: [],
    viewedIncomplete: [],
    pendingIncomplete: [],
    recentlyReminded: [],
    maximumRemindersReached: [],
    needsRecruiterFollowUp: [],
    missingSignatureRequest: [],
    invalidEmails: [],
    statusConflicts: [],
    dropboxLookupFailures: [],
    statusUnverified: [],
  };
}

function shouldConsiderWorkflow(workflow: CandidateWorkflowRecord): boolean {
  return (
    workflow.workflowStatus === "Paperwork Sent" ||
    workflow.paperworkStatus === "sent" ||
    workflow.paperworkStatus === "viewed" ||
    workflow.paperworkStatus === "signed" ||
    Boolean(workflow.signatureRequestId?.trim())
  );
}

export function accumulateP246Metrics(
  evaluations: P246CandidateEvaluation[],
  extras?: Partial<P246Metrics>,
): P246Metrics {
  const metrics = emptyMetrics();
  metrics.evaluated = evaluations.length;
  for (const row of evaluations) {
    if (row.dropboxVerified) metrics.dropboxVerified += 1;
    if (row.statusConflict) metrics.statusConflicts += 1;
    if (row.eligible && row.nextReminderNumber === 1) metrics.eligibleReminder1 += 1;
    if (row.eligible && row.nextReminderNumber === 2) metrics.eligibleReminder2 += 1;
    if (row.eligible && row.nextReminderNumber === 3) metrics.eligibleReminder3 += 1;
    if (row.eligible && row.nextReminderNumber === 4) metrics.eligibleReminder4 += 1;
    if (row.eligible) metrics.eligibleTotal += 1;

    if (row.dropboxLiveStatus === "viewed" && row.dropboxVerified) metrics.viewedIncomplete += 1;
    if (
      (row.dropboxLiveStatus === "pending" || row.dropboxLiveStatus === "awaiting_signature") &&
      row.dropboxVerified
    ) {
      metrics.pendingIncomplete += 1;
    }
    if (row.dropboxLiveStatus === "partially_signed" && row.dropboxVerified) {
      metrics.partiallySignedIncomplete += 1;
    }

    switch (row.eligibilityResult) {
      case "signed_or_completed":
        metrics.signedOrCompleted += 1;
        break;
      case "recently_reminded":
        metrics.recentlyReminded += 1;
        break;
      case "cooldown_not_met":
        metrics.cooldownNotMet += 1;
        break;
      case "maximum_reminders_reached":
        metrics.maximumRemindersReached += 1;
        break;
      case "needs_recruiter_follow_up":
        metrics.needsRecruiterFollowUp += 1;
        break;
      case "missing_signature_request":
        metrics.missingSignatureRequest += 1;
        break;
      case "invalid_email":
        metrics.invalidEmail += 1;
        break;
      case "dropbox_status_lookup_failed":
        metrics.dropboxLookupFailures += 1;
        break;
      case "status_unverified":
      case "system_configuration_error":
        metrics.statusUnverified += 1;
        break;
      case "active_in_mel":
        metrics.activeInMel += 1;
        break;
      case "do_not_contact":
        metrics.doNotContact += 1;
        break;
      case "packet_email_mismatch":
        metrics.packetEmailMismatch += 1;
        break;
      case "eligible":
        break;
      default:
        metrics.otherExclusions += 1;
        break;
    }
  }
  return { ...metrics, ...extras };
}

export function buildP246Buckets(evaluations: P246CandidateEvaluation[]): P246PreviewBuckets {
  const buckets = emptyBuckets();
  for (const row of evaluations) {
    if (row.eligible && row.nextReminderNumber === 1) buckets.eligibleReminder1.push(row);
    if (row.eligible && row.nextReminderNumber === 2) buckets.eligibleReminder2.push(row);
    if (row.eligible && row.nextReminderNumber === 3) buckets.eligibleReminder3.push(row);
    if (row.eligible && row.nextReminderNumber === 4) buckets.eligibleReminder4.push(row);
    if (row.eligibilityResult === "signed_or_completed") buckets.signedOrCompleted.push(row);
    if (row.dropboxLiveStatus === "viewed" && !row.eligible && row.dropboxVerified) {
      buckets.viewedIncomplete.push(row);
    }
    if (
      (row.dropboxLiveStatus === "pending" || row.dropboxLiveStatus === "awaiting_signature") &&
      !row.eligible &&
      row.dropboxVerified
    ) {
      buckets.pendingIncomplete.push(row);
    }
    if (
      row.eligibilityResult === "recently_reminded" ||
      row.eligibilityResult === "cooldown_not_met"
    ) {
      buckets.recentlyReminded.push(row);
    }
    if (row.eligibilityResult === "maximum_reminders_reached") {
      buckets.maximumRemindersReached.push(row);
    }
    if (row.eligibilityResult === "needs_recruiter_follow_up") {
      buckets.needsRecruiterFollowUp.push(row);
    }
    if (row.eligibilityResult === "missing_signature_request") {
      buckets.missingSignatureRequest.push(row);
    }
    if (row.eligibilityResult === "invalid_email") buckets.invalidEmails.push(row);
    if (row.statusConflict) buckets.statusConflicts.push(row);
    if (row.eligibilityResult === "dropbox_status_lookup_failed") {
      buckets.dropboxLookupFailures.push(row);
    }
    if (
      row.eligibilityResult === "status_unverified" ||
      row.eligibilityResult === "system_configuration_error"
    ) {
      buckets.statusUnverified.push(row);
    }
  }
  return buckets;
}

export function buildP246DashboardMetrics(input: {
  evaluations: P246CandidateEvaluation[];
  metrics: P246Metrics;
  mode: "preview" | "live" | "snapshot";
  generatedAt?: string;
}): P246DashboardMetrics {
  const signedWithDates = input.evaluations.filter(
    (e) =>
      e.eligibilityResult === "signed_or_completed" &&
      e.originalPaperworkSentAt &&
      e.dropboxVerified,
  );
  // Average days sent→signed approximated from evaluations that are signed and have send date;
  // without signedAt on evaluations we leave null unless we can compute from workflow later.
  let averageDaysSentToSigned: number | null = null;
  const daySpans: number[] = [];
  for (const row of signedWithDates) {
    const sentMs = Date.parse(row.originalPaperworkSentAt!);
    if (!Number.isFinite(sentMs)) continue;
    // Use last known activity as proxy only when signed — prefer not to invent signedAt.
    // Leave conversion metrics based on reminder history when available.
  }
  if (daySpans.length > 0) {
    averageDaysSentToSigned =
      Math.round((daySpans.reduce((a, b) => a + b, 0) / daySpans.length) * 10) / 10;
  }

  const reminded = input.evaluations.filter((e) => e.reminderCount > 0).length;
  const remindedAndSigned = input.evaluations.filter(
    (e) => e.reminderCount > 0 && e.eligibilityResult === "signed_or_completed",
  ).length;
  const reminderToSignConversionRate =
    reminded > 0 ? Math.round((remindedAndSigned / reminded) * 1000) / 1000 : null;

  return {
    totalOutstandingPaperwork: input.evaluations.filter(
      (e) =>
        e.dropboxVerified &&
        (e.dropboxLiveStatus === "pending" ||
          e.dropboxLiveStatus === "awaiting_signature" ||
          e.dropboxLiveStatus === "viewed" ||
          e.dropboxLiveStatus === "partially_signed"),
    ).length,
    pendingSignature: input.metrics.pendingIncomplete,
    viewedButNotSigned: input.metrics.viewedIncomplete,
    reminder1Due: input.metrics.eligibleReminder1,
    reminder2Due: input.metrics.eligibleReminder2,
    reminder3Due: input.metrics.eligibleReminder3,
    reminder4Due: input.metrics.eligibleReminder4,
    maximumRemindersReached: input.metrics.maximumRemindersReached,
    needsRecruiterFollowUp: input.metrics.needsRecruiterFollowUp,
    averageDaysSentToSigned,
    reminderToSignConversionRate,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: input.mode,
  };
}

export function resolveP246MailCapability(): P246MailCapability {
  return resolveP245MailCapability();
}

export async function buildP246Preview(input?: {
  probeDropbox?: boolean;
  dropboxConcurrency?: number;
  applySafeCorrections?: boolean;
  nowMs?: number;
}): Promise<P246PreviewReport> {
  const nowMs = input?.nowMs ?? Date.now();
  const probeDropbox = input?.probeDropbox ?? Boolean(readDropboxSignConfig());
  const concurrency = input?.dropboxConcurrency ?? 4;
  const applySafeCorrections = Boolean(input?.applySafeCorrections);

  const [workflows, ingestion, store] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadP246ReminderStore(),
  ]);
  const candidates = listIngestedCandidates(ingestion);
  const byId = new Map(candidates.map((c) => [c.candidateId, c]));
  const considered = Object.values(workflows).filter(shouldConsiderWorkflow);

  let stopCampaign = false;
  let stopReason: string | null = null;

  if (!probeDropbox || !readDropboxSignConfig()) {
    stopCampaign = true;
    stopReason =
      "Dropbox Sign authentication/config unavailable — cannot verify live packet status";
  }

  type ProbeRow = {
    workflow: CandidateWorkflowRecord;
    candidate: BreezyCandidate | null;
    probe: Awaited<ReturnType<typeof probeDropboxLiveStatus>> | null;
  };

  const rows: ProbeRow[] = considered.map((workflow) => ({
    workflow,
    candidate: byId.get(workflow.candidateId) ?? null,
    probe: null,
  }));

  const needsProbe = rows.filter((r) => probeDropbox && r.workflow.signatureRequestId?.trim());
  if (needsProbe.length > 0 && probeDropbox) {
    const probed = await mapPool(needsProbe, concurrency, async (row) => {
      const id = row.workflow.signatureRequestId!.trim();
      const result = await probeDropboxLiveStatus(id);
      return { candidateId: row.workflow.candidateId, result };
    });
    const byCandidate = new Map(probed.map((p) => [p.candidateId, p.result]));
    for (const row of rows) {
      row.probe = byCandidate.get(row.workflow.candidateId) ?? null;
    }

    const authFailures = probed.filter(
      (p) =>
        !p.result.ok &&
        (p.result.failure === "system_configuration_error" ||
          /unauthor|401|403|api key|authentication/i.test(p.result.error)),
    );
    if (authFailures.length > 0 && authFailures.length === probed.length) {
      stopCampaign = true;
      stopReason = "Dropbox Sign authentication failed for all signature lookups";
    }
  }

  const reconciliation: P246ReconciliationRecord[] = [];
  const evaluations: P246CandidateEvaluation[] = [];

  // Deduplicate by signature request id (keep first candidate; mark later as duplicate_packet)
  const seenSignatureRequests = new Map<string, string>();
  const seenEmails = new Map<string, string>();

  for (const row of rows) {
    const name = resolveCandidateName(row.workflow, row.candidate);
    const sigId = row.workflow.signatureRequestId?.trim() || null;
    const probe = row.probe;
    const dropboxVerified = Boolean(probe?.ok);
    const dropboxLiveStatus = probe?.ok ? probe.status : null;
    const dropboxSummary = probe?.ok ? probe.summary : null;
    const dropboxError = probe && !probe.ok ? probe.error : null;

    const reconcile = await reconcileCandidateStatus({
      candidateId: row.workflow.candidateId,
      candidateName: name,
      workflow: row.workflow,
      breezyStage: row.candidate?.stage?.trim() || null,
      signatureRequestId: sigId,
      dropboxLiveStatus,
      dropboxVerified,
      dropboxSummary,
      dropboxError,
      store,
      applySafeCorrections,
    });
    reconciliation.push(reconcile.record);

    let evaluation = evaluateP246Eligibility({
      workflow: row.workflow,
      candidate: row.candidate,
      store,
      dropboxLiveStatus,
      dropboxVerified,
      dropboxSummary,
      dropboxError,
      reconciliationNote:
        reconcile.record.conflictType !== "none" ? reconcile.record.detail : null,
      statusConflict: reconcile.record.conflictType !== "none" && reconcile.record.conflictType !== "missing_signature_request",
      nowMs,
    });

    if (sigId && seenSignatureRequests.has(sigId) && evaluation.eligible) {
      evaluation = {
        ...evaluation,
        eligible: false,
        eligibilityResult: "duplicate_packet",
        exclusionReason: `Duplicate signature request already evaluated for candidate ${seenSignatureRequests.get(sigId)}`,
        nextReminderNumber: null,
        idempotencyKey: null,
      };
    } else if (sigId) {
      seenSignatureRequests.set(sigId, row.workflow.candidateId);
    }

    const emailKey = evaluation.email?.trim().toLowerCase() ?? "";
    if (emailKey && seenEmails.has(emailKey) && evaluation.eligible) {
      evaluation = {
        ...evaluation,
        eligible: false,
        eligibilityResult: "duplicate_candidate",
        exclusionReason: `Duplicate email already evaluated for candidate ${seenEmails.get(emailKey)}`,
        nextReminderNumber: null,
        idempotencyKey: null,
      };
    } else if (emailKey) {
      seenEmails.set(emailKey, row.workflow.candidateId);
    }

    evaluations.push(evaluation);
  }

  const metrics = accumulateP246Metrics(evaluations);
  const buckets = buildP246Buckets(evaluations);
  const mail = resolveP246MailCapability();
  const dashboard = buildP246DashboardMetrics({
    evaluations,
    metrics,
    mode: "preview",
    generatedAt: new Date(nowMs).toISOString(),
  });

  const eligible = evaluations.filter((e) => e.eligible);
  const wouldSend = eligible.map((row) => {
    const emailContent = buildP245ReminderEmail({ firstName: row.firstName });
    return {
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      email: row.email!,
      signatureRequestId: row.signatureRequestId!,
      reminderNumber: row.nextReminderNumber as P246ReminderNumber,
      idempotencyKey: row.idempotencyKey!,
      dropboxLiveStatus: row.dropboxLiveStatus!,
      subject: emailContent.subject,
      bodyPreview: emailContent.text.slice(0, 280),
    };
  });

  return {
    phase: P246_PHASE,
    generatedAt: new Date(nowMs).toISOString(),
    mode: "preview",
    mail,
    metrics,
    dashboard,
    evaluations,
    buckets,
    reconciliation,
    wouldSend,
    stopCampaign,
    stopReason,
  };
}
