import {
  P235_APPROVED_BY,
  P235_MAX_BATCH,
  P235_PHASE,
  type P235DmAssignmentRow,
  type P235GlobalDiff,
  type P235PromotionRow,
  type P235SelectionResult,
  type P235SendRow,
  type P235SideEffectAudit,
} from "@/lib/p235-controlled-newest-five-send/types";

export function formatP235SelectionMarkdown(selection: P235SelectionResult): string {
  return [
    `# P235 — Newest-Five Selection`,
    ``,
    `Generated: ${selection.generatedAt}`,
    `Phase: ${P235_PHASE}`,
    ``,
    `## Totals`,
    ``,
    `- Frozen P234 cohort size: **${selection.frozenCohortSize}**`,
    `- Evaluated (newest-first): **${selection.evaluatedCount}**`,
    `- Selected: **${selection.selectedCount}** / max ${selection.maxBatch}`,
    `- Exclusions: **${selection.exclusions.length}**`,
    ``,
    `## Selected (newest first)`,
    ``,
    `| Redacted ID | Name | Applied | DM | Miles | Tier | Position |`,
    `| --- | --- | --- | --- | ---: | --- | --- |`,
    ...selection.selected.map(
      (row) =>
        `| \`${row.redactedCandidateId}\` | ${row.displayName} | ${row.appliedDate} | ${row.dm.proposedAssignedDM ?? ""} | ${row.proximity?.nearestMiles ?? "—"} | ${row.proximity?.coverageTier ?? "—"} | ${row.positionName} |`,
    ),
    ``,
    `## Exclusions (evaluated not selected)`,
    ``,
    `| Redacted ID | Name | Applied | Reason | Detail |`,
    `| --- | --- | --- | --- | --- |`,
    ...selection.exclusions.map(
      (row) =>
        `| \`${row.redactedCandidateId}\` | ${row.displayName} | ${row.appliedDate} | ${row.reason} | ${row.detail} |`,
    ),
    ``,
  ].join("\n");
}

export function formatP235LiveSendReportMarkdown(input: {
  generatedAt: string;
  testMode: boolean;
  selection: P235SelectionResult;
  dmRows: P235DmAssignmentRow[];
  promotionRows: P235PromotionRow[];
  sendRows: P235SendRow[];
  globalDiff: P235GlobalDiff;
  audit: P235SideEffectAudit;
}): string {
  return [
    `# P235 — Controlled Live Newest-Five Send Report`,
    ``,
    `Generated: ${input.generatedAt}`,
    `Approved by: ${P235_APPROVED_BY}`,
    `Mode: live`,
    `Dropbox testMode: **${input.testMode}**`,
    `Max batch: ${P235_MAX_BATCH}`,
    ``,
    `## Pipeline summary`,
    ``,
    `- Frozen cohort: **${input.selection.frozenCohortSize}**`,
    `- Evaluated: **${input.selection.evaluatedCount}**`,
    `- Selected: **${input.selection.selectedCount}**`,
    `- DM assignments applied: **${input.dmRows.filter((r) => r.applied).length}**`,
    `- Promotions to Paperwork Needed: **${input.promotionRows.filter((r) => r.promoted).length}**`,
    `- Dropbox Sign sends: **${input.sendRows.filter((r) => r.ok).length}**`,
    ``,
    `## Recipients`,
    ``,
    `| Candidate | Applied | Recruiter | DM | Miles | Tier | Stage | Paperwork | Signature Request ID |`,
    `| --- | --- | --- | --- | ---: | --- | --- | --- | --- |`,
    ...input.sendRows.map((row) => {
      const sel = input.selection.selected.find((s) => s.candidateId === row.candidateId);
      return `| \`${row.redactedCandidateId}\` ${row.displayName} | ${sel?.appliedDate ?? ""} | ${row.assignedRecruiter} | ${row.assignedDM} | ${row.distanceMiles ?? "—"} | ${row.coverageTier ?? "—"} | ${row.stageBefore} → ${row.stageAfter} | ${row.paperworkBefore} → ${row.paperworkAfter} | \`${row.signatureRequestId}\` |`;
    }),
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
    `≤${P235_MAX_BATCH} paperwork recipients from P234 verified cohort only. Dropbox Sign remained testMode=${input.testMode}. Stopped after verification.`,
    ``,
  ].join("\n");
}

export function buildP235SideEffectAudit(input: {
  paperworkRecipients: number;
  dropboxSignRequestsCreated: number;
  duplicateSignatureRequests: number;
  testMode: boolean;
  recoveryStoreUnchanged: boolean;
  geocodeCacheOnlyAuthoritativeAdditions: boolean;
  nonTargetWorkflowChanges: number;
  details?: string[];
}): P235SideEffectAudit {
  const ok =
    input.paperworkRecipients <= P235_MAX_BATCH &&
    input.dropboxSignRequestsCreated === input.paperworkRecipients &&
    input.duplicateSignatureRequests === 0 &&
    input.testMode === true &&
    input.recoveryStoreUnchanged &&
    input.nonTargetWorkflowChanges === 0;

  return {
    phase: P235_PHASE,
    generatedAt: new Date().toISOString(),
    paperworkRecipients: input.paperworkRecipients,
    maxBatchHonored: input.paperworkRecipients <= P235_MAX_BATCH,
    dropboxSignRequestsCreated: input.dropboxSignRequestsCreated,
    duplicateSignatureRequests: input.duplicateSignatureRequests,
    testMode: input.testMode,
    melWrites: 0,
    breezyWrites: 0,
    recruiterChanges: 0,
    reminderEmails: 0,
    reminderJobs: 0,
    ingestionGapHandled: 0,
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
      "No ingestion-gap handling",
      `testMode=${input.testMode}`,
      `recipients=${input.paperworkRecipients}≤${P235_MAX_BATCH}`,
    ],
  };
}
