export {
  P248_PHASE,
  P248_CANARY_SIZE,
  P248_APPROVED_FROM_FALLBACK,
} from "@/lib/p248-resend-live-reminder-campaign/types";

export type {
  P248ResendConfigCheck,
  P248FrozenCohort,
  P248CleanupInvalidEmail,
  P248CleanupMissingSignature,
} from "@/lib/p248-resend-live-reminder-campaign/types";

export {
  checkP248ResendConfiguration,
  formatP248ResendConfigurationMarkdown,
  verifyResendSenderDomain,
} from "@/lib/p248-resend-live-reminder-campaign/config-check";

export { freezeP248Reminder1Cohort } from "@/lib/p248-resend-live-reminder-campaign/freeze";

export { buildP248CleanupReports } from "@/lib/p248-resend-live-reminder-campaign/cleanup";

export {
  runP248ResendLiveReminderCampaign,
  type P248RunOptions,
  type P248RunResult,
} from "@/lib/p248-resend-live-reminder-campaign/run";
