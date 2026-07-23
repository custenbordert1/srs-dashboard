import {
  P239_APPROVED_BY,
  P239_MAX_BATCH,
  P239_PHASE,
  type P239GlobalDiff,
  type P239SelectionResult,
  type P239SendRow,
  type P239SideEffectAudit,
  type P239SkippedRow,
} from "@/lib/p239-final-remaining-auto-eligible-send/types";

export function formatP239SendReportMarkdown(input: {
  generatedAt: string;
  testMode: boolean;
  mode: "preview" | "live";
  selection: P239SelectionResult;
  sendRows: P239SendRow[];
  skipped: P239SkippedRow[];
  globalDiff: P239GlobalDiff;
  audit: P239SideEffectAudit;
  duplicatePreventionHits: number;
  dropboxFailures: Array<{ redactedCandidateId: string; displayName: string; error: string }>;
}): string {
  const sent = input.sendRows.filter((r) => r.ok);
  return [
    `# P239 — Final Remaining Auto-Eligible Paperwork Send`,
    ``,
    `Generated: ${input.generatedAt}`,
    `Approved by: ${P239_APPROVED_BY}`,
    `Mode: ${input.mode}`,
    `Dropbox testMode: **${input.testMode}**`,
    `Max batch: ${P239_MAX_BATCH}`,
    ``,
    `## Pipeline summary`,
    ``,
    `- P238 batch_full pool: **${input.selection.p238BatchFullPoolSize}**`,
    `- Prior excluded (P221/P227/P235/P237/P238): **${input.selection.priorExcludedCount}**`,
    `- Evaluated: **${input.selection.evaluatedCount}**`,
    `- Auto-eligible: **${input.selection.eligibleCount}**`,
    `- Selected (≤${P239_MAX_BATCH}): **${input.selection.selectedCount}**`,
    `- Successfully sent: **${sent.length}**`,
    `- Skipped / blocked: **${input.skipped.length}**`,
    `- Dropbox failures: **${input.dropboxFailures.length}**`,
    `- Duplicate prevention hits: **${input.duplicatePreventionHits}**`,
    ``,
    `## Successfully sent`,
    ``,
    `| Candidate | Applied | Recruiter | DM | Miles | Tier | Stage | Paperwork | Signature Request ID |`,
    `| --- | --- | --- | --- | ---: | --- | --- | --- | --- |`,
    ...sent.map(
      (row) =>
        `| \`${row.redactedCandidateId}\` ${row.displayName} | ${row.appliedDate} | ${row.assignedRecruiter} | ${row.assignedDM} | ${row.distanceMiles ?? "—"} | ${row.coverageTier ?? "—"} | ${row.stageBefore} → ${row.stageAfter} | ${row.paperworkBefore} → ${row.paperworkAfter} | \`${row.signatureRequestId}\` |`,
    ),
    ``,
    `## Skipped / blocked`,
    ``,
    `| Candidate | Applied | Phase | Reason | Detail |`,
    `| --- | --- | --- | --- | --- |`,
    ...input.skipped.map(
      (row) =>
        `| \`${row.redactedCandidateId}\` ${row.displayName} | ${row.appliedDate} | ${row.phase} | ${row.reason} | ${row.detail} |`,
    ),
    ``,
    `## Global diff`,
    ``,
    `- Target records changed: **${input.globalDiff.targetCount}**`,
    `- Non-target records changed: **${input.globalDiff.nonTargetCount}**`,
    `- Target-only: **${input.globalDiff.targetOnly}**`,
    `- MEL writes: ${input.audit.melWrites}`,
    `- Breezy writes: ${input.audit.breezyWrites}`,
    `- Recruiter changes: ${input.audit.recruiterChanges}`,
    ``,
    `## Confirmation`,
    ``,
    `≤${P239_MAX_BATCH} final remaining auto-eligible recipients from P238 batch_full, excluding P221/P227/P235/P237/P238.`,
    `Dropbox Sign remained testMode=${input.testMode}. Per-candidate failures continued the batch.`,
    `Stopped after every remaining auto-eligible candidate was sent or blocked (or max ${P239_MAX_BATCH}).`,
    ``,
  ].join("\n");
}

export function buildP239SideEffectAudit(input: {
  paperworkRecipients: number;
  dropboxSignRequestsCreated: number;
  duplicateSignatureRequests: number;
  testMode: boolean;
  recoveryStoreUnchanged: boolean;
  geocodeCacheOnlyAuthoritativeAdditions: boolean;
  nonTargetWorkflowChanges: number;
  details?: string[];
}): P239SideEffectAudit {
  const ok =
    input.paperworkRecipients <= P239_MAX_BATCH &&
    input.dropboxSignRequestsCreated === input.paperworkRecipients &&
    input.duplicateSignatureRequests === 0 &&
    input.testMode === true &&
    input.recoveryStoreUnchanged &&
    input.nonTargetWorkflowChanges === 0;

  return {
    phase: P239_PHASE,
    generatedAt: new Date().toISOString(),
    paperworkRecipients: input.paperworkRecipients,
    maxBatchHonored: input.paperworkRecipients <= P239_MAX_BATCH,
    dropboxSignRequestsCreated: input.dropboxSignRequestsCreated,
    duplicateSignatureRequests: input.duplicateSignatureRequests,
    testMode: input.testMode,
    melWrites: 0,
    breezyWrites: 0,
    recruiterChanges: 0,
    reminderEmails: 0,
    reminderJobs: 0,
    recoveryStoreUnchanged: input.recoveryStoreUnchanged,
    geocodeCacheOnlyAuthoritativeAdditions: input.geocodeCacheOnlyAuthoritativeAdditions,
    advancedBeyondPaperworkSent: 0,
    nonTargetWorkflowChanges: input.nonTargetWorkflowChanges,
    ok,
    details: input.details ?? [
      "No MEL writes",
      "No Breezy writes",
      "No recruiter changes",
      "No reminders",
      `testMode=${input.testMode}`,
      `recipients=${input.paperworkRecipients}≤${P239_MAX_BATCH}`,
    ],
  };
}
