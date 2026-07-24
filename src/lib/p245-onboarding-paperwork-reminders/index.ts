export {
  P245_PHASE,
  P245_SUBJECT,
  P245_BATCH_SIZE,
  P245_BATCH_PAUSE_MS,
  P245_REMINDER_COOLDOWN_MS,
  P245_STORE_FILENAME,
  P245_CONFIRM_LIVE_FLAG,
} from "@/lib/p245-onboarding-paperwork-reminders/types";

export type {
  P245PacketStatus,
  P245SkipReason,
  P245DeliveryStatus,
  P245ReminderHistoryEntry,
  P245ReminderStore,
  P245CandidateEvaluation,
  P245ReminderSendRecord,
  P245Metrics,
  P245MailCapability,
  P245PreviewReport,
  P245RunResult,
} from "@/lib/p245-onboarding-paperwork-reminders/types";

export {
  buildP245ReminderEmail,
  extractFirstName,
} from "@/lib/p245-onboarding-paperwork-reminders/template";

export {
  emptyP245ReminderStore,
  loadP245ReminderStore,
  saveP245ReminderStore,
  getCandidateReminderState,
  recordSuccessfulReminder,
  wasRemindedWithinCooldown,
} from "@/lib/p245-onboarding-paperwork-reminders/store";

export {
  isValidP245Email,
  resolveCandidateEmail,
  resolveCandidateName,
  isDoNotContact,
  isActiveInMel,
  mapDropboxToPacketStatus,
  mapWorkflowToPacketStatus,
  evaluateP245Eligibility,
  probePacketStatus,
  mapPool,
} from "@/lib/p245-onboarding-paperwork-reminders/eligibility";

export {
  accumulateP245Metrics,
  resolveP245MailCapability,
  buildP245Preview,
} from "@/lib/p245-onboarding-paperwork-reminders/evaluate";

export { sendP245ReminderBatch } from "@/lib/p245-onboarding-paperwork-reminders/send";

export { formatP245PreviewMarkdown } from "@/lib/p245-onboarding-paperwork-reminders/format";

export {
  runP245OnboardingPaperworkReminders,
  type P245RunOptions,
} from "@/lib/p245-onboarding-paperwork-reminders/run";
