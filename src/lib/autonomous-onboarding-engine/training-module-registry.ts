import type { TrainingModuleDefinition } from "@/lib/autonomous-onboarding-engine/types";

function readEnvUrl(name: string): string | null {
  const raw = process.env[name]?.trim() ?? "";
  if (!raw || raw.toLowerCase().startsWith("your-")) return null;
  return raw;
}

export const TRAINING_MODULE_REGISTRY: TrainingModuleDefinition[] = [
  {
    key: "mel_test_survey",
    label: "MEL Test Survey",
    description: "Baseline skills and readiness survey before field assignment.",
    urlEnvVar: "AUTONOMOUS_ONBOARDING_MEL_TEST_SURVEY_URL",
    requiredForReadyForWork: true,
    sortOrder: 10,
    category: "survey",
  },
  {
    key: "store_call_training",
    label: "Store Call Training",
    description: "SRS merchandising store call procedures and expectations.",
    urlEnvVar: "AUTONOMOUS_ONBOARDING_STORE_CALL_TRAINING_URL",
    requiredForReadyForWork: true,
    sortOrder: 20,
    category: "course",
  },
  {
    key: "safety_acknowledgement",
    label: "Safety Acknowledgement",
    description: "Field safety policies and incident reporting acknowledgement.",
    urlEnvVar: "AUTONOMOUS_ONBOARDING_SAFETY_ACK_URL",
    requiredForReadyForWork: true,
    sortOrder: 30,
    category: "acknowledgement",
  },
];

export function listTrainingModules(): TrainingModuleDefinition[] {
  return [...TRAINING_MODULE_REGISTRY].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getTrainingModule(key: string): TrainingModuleDefinition | null {
  return TRAINING_MODULE_REGISTRY.find((row) => row.key === key) ?? null;
}

export function resolveTrainingModuleUrl(module: TrainingModuleDefinition): string | null {
  return readEnvUrl(module.urlEnvVar);
}

export function resolveWelcomeReplyToEmail(): string {
  return (
    process.env.AUTONOMOUS_ONBOARDING_WELCOME_REPLY_TO?.trim() ||
    process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() ||
    "recruiting@srsmerchandising.com"
  );
}

export function resolveRecruitingContactPhone(): string {
  return process.env.AUTONOMOUS_ONBOARDING_CONTACT_PHONE?.trim() || "(555) 555-0100";
}
