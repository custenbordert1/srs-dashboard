import type { OnboardingPipelineStage } from "@/lib/onboarding-pipeline-engine/types";

export const P81_DUE_DATE_OFFSETS_DAYS = {
  welcome_email: 0,
  mel_test: 1,
  store_call: 2,
  training_checklist: 3,
  ready_for_work: 4,
} as const;

export type OnboardingDueDateKey = keyof typeof P81_DUE_DATE_OFFSETS_DAYS;

export type OnboardingDueDateEntry = {
  key: OnboardingDueDateKey;
  label: string;
  dueAt: string;
  offsetDays: number;
};

export type OnboardingDueDateSchedule = {
  anchorAt: string;
  estimatedReadyForWorkAt: string;
  entries: OnboardingDueDateEntry[];
};

const DUE_DATE_LABELS: Record<OnboardingDueDateKey, string> = {
  welcome_email: "Welcome Email",
  mel_test: "MEL Test",
  store_call: "Store Call",
  training_checklist: "Training Checklist",
  ready_for_work: "Ready for Work",
};

export function addDaysFromIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 24 * 60 * 60 * 1000).toISOString();
}

export function resolveOnboardingAnchorAt(input: {
  paperworkSignedAt: string | null;
  referenceAt: string;
}): string {
  return input.paperworkSignedAt ?? input.referenceAt;
}

export function buildOnboardingDueDateSchedule(input: {
  paperworkSignedAt: string | null;
  referenceAt: string;
}): OnboardingDueDateSchedule {
  const anchorAt = resolveOnboardingAnchorAt(input);
  const entries = (Object.keys(P81_DUE_DATE_OFFSETS_DAYS) as OnboardingDueDateKey[]).map((key) => ({
    key,
    label: DUE_DATE_LABELS[key],
    offsetDays: P81_DUE_DATE_OFFSETS_DAYS[key],
    dueAt: addDaysFromIso(anchorAt, P81_DUE_DATE_OFFSETS_DAYS[key]),
  }));

  return {
    anchorAt,
    estimatedReadyForWorkAt: addDaysFromIso(anchorAt, P81_DUE_DATE_OFFSETS_DAYS.ready_for_work),
    entries,
  };
}

export function dueDateForStage(
  schedule: OnboardingDueDateSchedule,
  stage: OnboardingPipelineStage,
): string {
  switch (stage) {
    case "paperwork_complete":
    case "welcome_email_ready":
      return schedule.entries.find((row) => row.key === "welcome_email")?.dueAt ?? schedule.anchorAt;
    case "mel_test_assigned":
      return schedule.entries.find((row) => row.key === "mel_test")?.dueAt ?? schedule.anchorAt;
    case "store_call_assigned":
      return schedule.entries.find((row) => row.key === "store_call")?.dueAt ?? schedule.anchorAt;
    case "training_pending":
      return schedule.entries.find((row) => row.key === "training_checklist")?.dueAt ?? schedule.anchorAt;
    case "ready_for_work":
      return schedule.estimatedReadyForWorkAt;
    default:
      return schedule.estimatedReadyForWorkAt;
  }
}

export function isOverdue(dueAt: string, referenceAt: string): boolean {
  return Date.parse(dueAt) < Date.parse(referenceAt);
}

export function daysBetween(startIso: string, endIso: string): number {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

export function isDueWithinDays(dueAt: string, referenceAt: string, days: number): boolean {
  const dueMs = Date.parse(dueAt);
  const refMs = Date.parse(referenceAt);
  const horizonMs = refMs + days * 24 * 60 * 60 * 1000;
  return dueMs >= refMs && dueMs <= horizonMs;
}
