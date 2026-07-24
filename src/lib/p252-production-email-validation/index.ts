export {
  P252_PHASE,
  P252_OPS_DATE,
  P252_INTERNAL_TEST_ENV_VARS,
  P252_TEST_SUBJECT,
} from "@/lib/p252-production-email-validation/types";

export type {
  P252ResendProbe,
  P252LiveDeliveryValidation,
  P252PipelineReadiness,
  P252CapacityProjection,
  P252GoNoGo,
  P252ProductionValidation,
} from "@/lib/p252-production-email-validation/types";

export { runP252ProductionEmailValidation } from "@/lib/p252-production-email-validation/run";
export { probeResendProduction } from "@/lib/p252-production-email-validation/resend-probe";
export { formatP252ProductionValidationMarkdown } from "@/lib/p252-production-email-validation/format";
