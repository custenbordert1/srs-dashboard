import { appendFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { observeWorkflowUpsertSafe } from "@/lib/p186-2-event-adapters";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import {
  evaluateP184Eligibility,
  buildP184IdempotencyKey,
} from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import { sendP184Paperwork } from "@/lib/p184-autonomous-paperwork-send-engine/sender";
import {
  loadP184EngineState,
  saveP184EngineState,
  updateP184Config,
} from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type { P184QueueItem } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import {
  recordP185SendUnverified,
  reconcileP185Envelopes,
} from "@/lib/p185-production-paperwork-automation-runner";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import { assertCohortImmutable } from "@/lib/p191-paperwork-release-pilot/freeze";
import { validatePaperworkReleaseCandidate } from "@/lib/p191-paperwork-release-pilot/validate";
import {
  P191_MAX_SENDS,
  P191_PAPERWORK_NEEDED_STATUS,
  P191_REASON,
  type P191Authorization,
  type P191ExecutionResult,
  type P191FrozenCohort,
  type P191SendAttempt,
} from "@/lib/p191-paperwork-release-pilot/types";

function auditJsonlPath(): string {
  return path.join(recruitingDataDir(), "p191-paperwork-release-audit.jsonl");
}

async function appendP191Audit(record: Record<string, unknown>): Promise<string> {
  const id = String(record.id ?? `p191-aud-${randomUUID().slice(0, 10)}`);
  const full = { ...record, id, at: record.at ?? new Date().toISOString() };
  try {
    await safeRecruitingMkdir(recruitingDataDir());
    await appendFile(auditJsonlPath(), `${JSON.stringify(full)}\n`, "utf8");
  } catch {
    // memory-less durable best effort
  }
  return id;
}

export async function forceP184DryRun(): Promise<"dry_run" | "live" | "unknown"> {
  try {
    delete process.env.P184_LIVE_SEND;
    process.env.P184_MODE = "dry_run";
    const state = await updateP184Config({ mode: "dry_run" });
    return state.config.mode === "dry_run" ? "dry_run" : state.config.mode;
  } catch {
    return "unknown";
  }
}

async function enableP184LiveForCohortSend(): Promise<void> {
  process.env.P184_MODE = "live";
  await updateP184Config({ mode: "live", enabled: true });
}

/**
 * Sequential (concurrency=1) Paperwork Needed + live P184 send for frozen cohort only.
 * Restores P184 dry_run after every candidate (and on abort).
 */
export async function executeP191PaperworkReleasePilot(input: {
  cohort: P191FrozenCohort;
  authorization: P191Authorization;
  candidatesById: Map<string, BreezyCandidate>;
}): Promise<P191ExecutionResult> {
  const attempts: P191SendAttempt[] = [];
  let successful = 0;
  let failed = 0;
  let auditEvents = 0;
  let p186Observations = 0;
  let confirmedDropboxSignSends = 0;
  let duplicateEnvelopes = 0;
  let failedEnvelopes = 0;
  let viewed = 0;
  let signed = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  const empty = (reason: string): P191ExecutionResult => ({
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: 0,
    successful: 0,
    failed: 0,
    confirmedDropboxSignSends: 0,
    duplicateEnvelopes: 0,
    auditEvents: 0,
    p186Observations: 0,
    finalP184Mode: "dry_run",
    automationStatus: "off",
    queueRemaining: input.cohort.members.length,
    viewed: 0,
    signed: 0,
    failedEnvelopes: 0,
    stoppedEarly: true,
    stopReason: reason,
    attempts: [],
    melExports: 0,
  });

  if (input.authorization.fingerprint !== input.cohort.fingerprint) {
    return empty("Authorization fingerprint mismatch");
  }
  if (input.authorization.cohortId !== input.cohort.cohortId) {
    return empty("Authorization cohortId mismatch");
  }
  if (Date.parse(input.authorization.expiresAt) < Date.now()) {
    return empty("Authorization expired");
  }
  if (
    input.authorization.allowContinuousAutomation ||
    input.authorization.allowScheduler ||
    input.authorization.allowP187 ||
    input.authorization.allowMel ||
    input.authorization.allowOutsideCohort
  ) {
    return empty("Authorization must disallow automation/scheduler/P187/MEL/outside cohort");
  }
  if (input.cohort.members.length > P191_MAX_SENDS) {
    return empty("Cohort exceeds max sends");
  }

  // Ensure start in dry_run
  await forceP184DryRun();

  try {
    for (const member of input.cohort.members) {
      assertCohortImmutable(input.cohort, member.candidateId);

      let p184ModeAfter: "dry_run" | "live" | "unknown" = "unknown";
      const correlationId = `p191-${randomUUID().slice(0, 12)}`;

      try {
        const p184Before = await loadP184EngineState();
        const workflows = await getCandidateWorkflowState();
        const wf = workflows[member.candidateId];
        const validation = validatePaperworkReleaseCandidate({
          member,
          workflow: wf,
          jobResolved: Boolean(member.jobId.trim()),
          p184Mode: p184Before.config.mode,
        });

        if (!validation.ok) {
          if (validation.blockers.some((b) => b.includes("no_dropbox_envelope") || b.includes("no_paperwork"))) {
            duplicateEnvelopes += 1;
          }
          failed += 1;
          const auditId = await appendP191Audit({
            action: "paperwork_release_blocked",
            candidateId: member.candidateId,
            actor: input.authorization.authorizedBy,
            ok: false,
            blockers: validation.blockers,
            gates: validation.gates,
            cohortId: input.cohort.cohortId,
          });
          auditEvents += 1;
          attempts.push({
            candidateId: member.candidateId,
            ok: false,
            status: "blocked",
            correlationId,
            idempotencyKey: member.idempotencyKey,
            auditId,
            p186Observed: false,
            previousWorkflowStatus: wf?.workflowStatus ?? null,
            resultingWorkflowStatus: wf?.workflowStatus ?? null,
            envelopeId: null,
            confirmedSent: false,
            recruiterPreserved: true,
            paperworkNeededCreated: false,
            dropboxSignSends: 0,
            melExports: 0,
            detail: validation.blockers.join("; "),
            blockers: validation.blockers,
            p184ModeAfterCandidate: "dry_run",
          });
          stoppedEarly = true;
          stopReason = `Validation failed for ${member.candidateId}`;
          break;
        }

        const candidate = input.candidatesById.get(member.candidateId);
        if (!candidate) {
          failed += 1;
          stoppedEarly = true;
          stopReason = `Missing ingestion candidate ${member.candidateId}`;
          break;
        }

        const now = new Date().toISOString();
        const note = [
          `[P191_PAPERWORK_NEEDED]`,
          `actor=${input.authorization.authorizedBy}`,
          `cohort=${input.cohort.cohortId}`,
          `corr=${correlationId}`,
          `idem=${member.idempotencyKey}`,
        ].join(" ");

        // 1) Create Paperwork Needed
        const pnRecord = await upsertCandidateWorkflow({
          candidateId: member.candidateId,
          workflowStatus: P191_PAPERWORK_NEEDED_STATUS,
          forceWorkflowStatus: true,
          assignedRecruiter: member.recruiter,
          expectedRecruiter: member.recruiter,
          expectedOwnershipVersion: member.expectedOwnershipVersion,
          actionType: "send-paperwork",
          requiredAction: "Send onboarding paperwork",
          progressionReason: P191_REASON,
          progressionConfidence: 100,
          progressionPriority: "high",
          progressionGeneratedAt: now,
          actionPriority: "high",
          actionReason: `P191 Paperwork Needed by ${input.authorization.authorizedBy}`,
          actionGeneratedAt: now,
          note,
          audit: {
            action: "p191_paperwork_needed",
            byUserId: input.authorization.authorizedBy,
            metadata: {
              correlationId,
              idempotencyKey: member.idempotencyKey,
              cohortId: input.cohort.cohortId,
              fingerprint: input.cohort.fingerprint,
              liveSend: false,
            },
          },
        });

        let p186Observed = false;
        try {
          await observeWorkflowUpsertSafe({
            candidateId: pnRecord.candidateId,
            workflowStatus: pnRecord.workflowStatus,
            paperworkStatus: pnRecord.paperworkStatus,
          });
          p186Observed = true;
          p186Observations += 1;
        } catch {
          p186Observed = false;
        }

        if (pnRecord.workflowStatus !== P191_PAPERWORK_NEEDED_STATUS) {
          failed += 1;
          const auditId = await appendP191Audit({
            action: "paperwork_needed_verify_failed",
            candidateId: member.candidateId,
            ok: false,
            status: pnRecord.workflowStatus,
          });
          auditEvents += 1;
          attempts.push({
            candidateId: member.candidateId,
            ok: false,
            status: "pn_verify_failed",
            correlationId,
            idempotencyKey: member.idempotencyKey,
            auditId,
            p186Observed,
            previousWorkflowStatus: wf!.workflowStatus,
            resultingWorkflowStatus: pnRecord.workflowStatus,
            envelopeId: null,
            confirmedSent: false,
            recruiterPreserved: pnRecord.assignedRecruiter === member.recruiter,
            paperworkNeededCreated: false,
            dropboxSignSends: 0,
            melExports: 0,
            detail: `Expected Paperwork Needed, got ${pnRecord.workflowStatus}`,
            blockers: ["paperwork_needed_not_persisted"],
            p184ModeAfterCandidate: "dry_run",
          });
          stoppedEarly = true;
          stopReason = `Paperwork Needed not persisted for ${member.candidateId}`;
          break;
        }

        // Refresh ownership version after PN write for subsequent CAS if needed
        const ownershipAfterPn = pnRecord.recruiterOwnershipVersion ?? member.expectedOwnershipVersion;

        // 2) Temporarily enable P184 live for this candidate only
        await enableP184LiveForCohortSend();

        const row = buildScoredWorkflowRow(candidate, pnRecord);
        const overlay = {
          ...row,
          positionId: member.jobId || row.positionId,
          workflowStatus: P191_PAPERWORK_NEEDED_STATUS,
          stage: P191_PAPERWORK_NEEDED_STATUS,
          paperworkTemplateKey: row.paperworkTemplateKey ?? "onboarding_packet",
        };

        const p184Live = await loadP184EngineState();
        const eligibility = evaluateP184Eligibility({
          row: overlay,
          onboarding: null,
          job: null,
          config: { ...p184Live.config, mode: "live", enabled: true },
          queueItems: p184Live.queue.filter((q) => q.candidateId !== member.candidateId),
          completedIdempotencyKeys: new Set(p184Live.completedIdempotencyKeys),
          verifiedOnboardingJob: {
            positionId: member.jobId,
            acceptingForOnboarding: true,
            classification: "p191_pilot",
            detail: "P191 frozen cohort verified onboarding job",
          },
        });

        if (!eligibility.eligible || !eligibility.templateKey) {
          failed += 1;
          const auditId = await appendP191Audit({
            action: "p184_eligibility_blocked",
            candidateId: member.candidateId,
            ok: false,
            rejectionReasons: eligibility.rejectionReasons,
          });
          auditEvents += 1;
          attempts.push({
            candidateId: member.candidateId,
            ok: false,
            status: "eligibility_blocked",
            correlationId,
            idempotencyKey: member.idempotencyKey,
            auditId,
            p186Observed,
            previousWorkflowStatus: wf!.workflowStatus,
            resultingWorkflowStatus: pnRecord.workflowStatus,
            envelopeId: null,
            confirmedSent: false,
            recruiterPreserved: true,
            paperworkNeededCreated: true,
            dropboxSignSends: 0,
            melExports: 0,
            detail: eligibility.rejectionReasons.join("; "),
            blockers: eligibility.rejectionReasons,
            p184ModeAfterCandidate: "unknown",
          });
          stoppedEarly = true;
          stopReason = `P184 eligibility failed for ${member.candidateId}`;
          break;
        }

        const p184IdempotencyKey = buildP184IdempotencyKey({
          candidateId: member.candidateId,
          templateKey: eligibility.templateKey,
          positionId: member.jobId,
        });

        const queueItem: P184QueueItem = {
          candidateId: member.candidateId,
          candidateName:
            `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim() ||
            member.candidateId,
          candidateEmail: (candidate.email ?? "").trim().toLowerCase(),
          positionId: member.jobId,
          jobName: member.jobLabel,
          templateKey: eligibility.templateKey,
          idempotencyKey: p184IdempotencyKey,
          status: "sending",
          priority: {
            agingScore: 0,
            demandScore: 0,
            applicationAgeMs: 0,
            executivePriority: 0,
            composite: 0,
          },
          enqueuedAt: now,
          updatedAt: now,
          retryCount: 0,
          nextAttemptAt: now,
          lastError: null,
          permanentFailure: false,
          envelopeId: null,
          sentAt: null,
          durationMs: null,
        };

        await saveP184EngineState({
          ...p184Live,
          queue: [
            ...p184Live.queue.filter((q) => q.candidateId !== member.candidateId),
            queueItem,
          ],
        });

        // 3) Execute live send
        const sendResult = await sendP184Paperwork({
          item: queueItem,
          mode: "live",
          byUserId: input.authorization.authorizedBy,
        });

        let confirmedSent = false;
        let envelopeId = sendResult.envelopeId;

        if (sendResult.ok && sendResult.envelopeId && !sendResult.simulated) {
          await recordP185SendUnverified({
            candidateId: member.candidateId,
            envelopeId: sendResult.envelopeId,
            idempotencyKey: p184IdempotencyKey,
          });

          const afterSend = await loadP184EngineState();
          const q = afterSend.queue.find((x) => x.candidateId === member.candidateId);
          if (q) {
            q.status = "sent";
            q.envelopeId = sendResult.envelopeId;
            q.sentAt = sendResult.sentAt;
          }
          if (!afterSend.completedIdempotencyKeys.includes(p184IdempotencyKey)) {
            afterSend.completedIdempotencyKeys.push(p184IdempotencyKey);
          }
          await saveP184EngineState(afterSend);

          try {
            await getSignatureRequest(sendResult.envelopeId);
            await reconcileP185Envelopes({
              deps: { getSignatureRequest },
            });
            confirmedSent = true;
            confirmedDropboxSignSends += 1;
          } catch (err) {
            failedEnvelopes += 1;
            failed += 1;
            const auditId = await appendP191Audit({
              action: "confirmed_sent_failed",
              candidateId: member.candidateId,
              envelopeId: sendResult.envelopeId,
              ok: false,
              detail: err instanceof Error ? err.message : String(err),
            });
            auditEvents += 1;
            attempts.push({
              candidateId: member.candidateId,
              ok: false,
              status: "sent_unverified",
              correlationId,
              idempotencyKey: member.idempotencyKey,
              auditId,
              p186Observed,
              previousWorkflowStatus: wf!.workflowStatus,
              resultingWorkflowStatus: null,
              envelopeId: sendResult.envelopeId,
              confirmedSent: false,
              recruiterPreserved: true,
              paperworkNeededCreated: true,
              dropboxSignSends: 1,
              melExports: 0,
              detail: `Send succeeded but confirmed_sent verify failed: ${err instanceof Error ? err.message : String(err)}`,
              blockers: ["confirmed_sent_failed"],
              p184ModeAfterCandidate: "unknown",
            });
            stoppedEarly = true;
            stopReason = `confirmed_sent failed for ${member.candidateId}`;
            break;
          }
        } else {
          failedEnvelopes += 1;
          failed += 1;
          const auditId = await appendP191Audit({
            action: "p184_send_failed",
            candidateId: member.candidateId,
            ok: false,
            error: sendResult.error,
            simulated: sendResult.simulated,
          });
          auditEvents += 1;
          attempts.push({
            candidateId: member.candidateId,
            ok: false,
            status: "send_failed",
            correlationId,
            idempotencyKey: member.idempotencyKey,
            auditId,
            p186Observed,
            previousWorkflowStatus: wf!.workflowStatus,
            resultingWorkflowStatus: pnRecord.workflowStatus,
            envelopeId: sendResult.envelopeId,
            confirmedSent: false,
            recruiterPreserved: true,
            paperworkNeededCreated: true,
            dropboxSignSends: 0,
            melExports: 0,
            detail: sendResult.error ?? "send failed",
            blockers: ["p184_send_failed"],
            p184ModeAfterCandidate: "unknown",
          });
          stoppedEarly = true;
          stopReason = `P184 send failed for ${member.candidateId}: ${sendResult.error}`;
          break;
        }

        // 4) Post-send verify
        const afterState = await getCandidateWorkflowState();
        const after = afterState[member.candidateId];
        const recruiterPreserved = after?.assignedRecruiter === member.recruiter;
        const exactlyOneEnvelope = Boolean(after?.signatureRequestId) &&
          after!.signatureRequestId === envelopeId;
        const advanced =
          after?.workflowStatus === "Paperwork Sent" ||
          after?.paperworkStatus === "sent";
        const noDup =
          after?.signatureRequestId === envelopeId &&
          confirmedSent;

        // Observe send upsert if workflow advanced
        try {
          if (after) {
            await observeWorkflowUpsertSafe({
              candidateId: after.candidateId,
              workflowStatus: after.workflowStatus,
              paperworkStatus: after.paperworkStatus,
            });
            p186Observations += 1;
            p186Observed = true;
          }
        } catch {
          // keep prior observe
        }

        void ownershipAfterPn;

        if (!confirmedSent || !exactlyOneEnvelope || !recruiterPreserved || !advanced || !noDup) {
          failed += 1;
          const auditId = await appendP191Audit({
            action: "post_send_verify_failed",
            candidateId: member.candidateId,
            ok: false,
            envelopeId,
            status: after?.workflowStatus,
            paperworkStatus: after?.paperworkStatus,
            signatureRequestId: after?.signatureRequestId,
          });
          auditEvents += 1;
          attempts.push({
            candidateId: member.candidateId,
            ok: false,
            status: "verify_failed",
            correlationId,
            idempotencyKey: member.idempotencyKey,
            auditId,
            p186Observed,
            previousWorkflowStatus: wf!.workflowStatus,
            resultingWorkflowStatus: after?.workflowStatus ?? null,
            envelopeId,
            confirmedSent,
            recruiterPreserved,
            paperworkNeededCreated: true,
            dropboxSignSends: 1,
            melExports: 0,
            detail: `Post-send verify failed advanced=${advanced} envelope=${exactlyOneEnvelope} recruiter=${recruiterPreserved}`,
            blockers: ["post_send_verify"],
            p184ModeAfterCandidate: "unknown",
          });
          stoppedEarly = true;
          stopReason = `Post-send verify failed for ${member.candidateId}`;
          break;
        }

        if (after?.paperworkStatus === "viewed") viewed += 1;
        if (after?.paperworkStatus === "signed") signed += 1;

        const auditId = await appendP191Audit({
          action: "paperwork_release_confirmed",
          candidateId: member.candidateId,
          actor: input.authorization.authorizedBy,
          ok: true,
          envelopeId,
          confirmedSent: true,
          correlationId,
          idempotencyKey: member.idempotencyKey,
          previousWorkflowStatus: wf!.workflowStatus,
          resultingWorkflowStatus: after!.workflowStatus,
        });
        auditEvents += 1;

        successful += 1;
        attempts.push({
          candidateId: member.candidateId,
          ok: true,
          status: "confirmed_sent",
          correlationId,
          idempotencyKey: member.idempotencyKey,
          auditId,
          p186Observed,
          previousWorkflowStatus: wf!.workflowStatus,
          resultingWorkflowStatus: after!.workflowStatus,
          envelopeId,
          confirmedSent: true,
          recruiterPreserved,
          paperworkNeededCreated: true,
          dropboxSignSends: 1,
          melExports: 0,
          detail: "Paperwork Needed + confirmed_sent; P184 restored to dry_run",
          blockers: [],
          p184ModeAfterCandidate: "dry_run",
        });
      } finally {
        // Always restore dry_run before next candidate / abort
        p184ModeAfter = await forceP184DryRun();
        const last = attempts[attempts.length - 1];
        if (last && last.candidateId === member.candidateId) {
          last.p184ModeAfterCandidate = p184ModeAfter;
        }
      }

      if (stoppedEarly) break;
    }
  } finally {
    // Absolute guarantee after loop
    await forceP184DryRun();
  }

  const finalMode = await forceP184DryRun();
  const queueRemaining = input.cohort.members.length - successful;

  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: attempts.length,
    successful,
    failed,
    confirmedDropboxSignSends,
    duplicateEnvelopes,
    auditEvents,
    p186Observations,
    finalP184Mode: finalMode,
    automationStatus: "off",
    queueRemaining,
    viewed,
    signed,
    failedEnvelopes,
    stoppedEarly,
    stopReason,
    attempts,
    melExports: 0,
  };
}
