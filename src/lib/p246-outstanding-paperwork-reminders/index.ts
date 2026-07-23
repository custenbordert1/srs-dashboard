export {
  P246_PHASE,
  P246_SUBJECT,
  P246_BATCH_SIZE,
  P246_BATCH_PAUSE_MS,
  P246_MAX_REMINDERS,
  P246_STORE_FILENAME,
  P246_CADENCE_MS,
  P246_CONFIRM_LIVE_FLAG,
  P246_ELIGIBLE_DROPBOX_STATUSES,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

export type {
  P246ReminderNumber,
  P246DropboxLiveStatus,
  P246Disposition,
  P246FailureClass,
  P246CandidateEvaluation,
  P246ReminderSendRecord,
  P246Metrics,
  P246PreviewReport,
  P246RunResult,
  P246DashboardMetrics,
  P246ReconciliationRecord,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

export {
  buildP246IdempotencyKey,
  packetReminderKey,
  nextReminderNumber,
  isCadenceSatisfied,
} from "@/lib/p246-outstanding-paperwork-reminders/cadence";

export {
  emptyP246ReminderStore,
  loadP246ReminderStore,
  saveP246ReminderStore,
  getPacketReminderState,
  hasIdempotencyKey,
  recordSuccessfulReminder,
  markNeedsRecruiterFollowUp,
} from "@/lib/p246-outstanding-paperwork-reminders/store";

export {
  mapDropboxSummaryToLiveStatus,
  isEligibleDropboxStatus,
  probeDropboxLiveStatus,
  packetIncludesEmail,
  candidateSignerStillOutstanding,
} from "@/lib/p246-outstanding-paperwork-reminders/dropbox-status";

export { evaluateP246Eligibility } from "@/lib/p246-outstanding-paperwork-reminders/eligibility";

export {
  buildP246Preview,
  accumulateP246Metrics,
  buildP246DashboardMetrics,
  resolveP246MailCapability,
} from "@/lib/p246-outstanding-paperwork-reminders/evaluate";

export { sendP246ReminderBatch } from "@/lib/p246-outstanding-paperwork-reminders/send";

export {
  formatP246PreviewMarkdown,
  formatP246FinalMarkdown,
} from "@/lib/p246-outstanding-paperwork-reminders/format";

export {
  runP246OutstandingPaperworkReminders,
  type P246RunOptions,
} from "@/lib/p246-outstanding-paperwork-reminders/run";

export {
  readP246DashboardSnapshot,
  writeP246DashboardSnapshot,
} from "@/lib/p246-outstanding-paperwork-reminders/dashboard";
