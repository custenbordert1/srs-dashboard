import type { RecruitingActionType } from "@/lib/candidate-recruiting-actions";

const TYPES: RecruitingActionType[] = [
  "dm-review",
  "recommend-interview",
  "needs-follow-up",
  "priority-list",
  "onboarding-packet",
];

export function isRecruitingActionType(value: string): value is RecruitingActionType {
  return TYPES.includes(value as RecruitingActionType);
}
