import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { OnboardingActivityHistoryEntry } from "@/lib/onboarding-pipeline-engine/types";

export function buildOnboardingActivityHistory(
  snapshot: OnboardingWorkspaceCandidateSnapshot,
): OnboardingActivityHistoryEntry[] {
  return snapshot.activityTimeline.map((entry) => ({
    id: entry.id,
    label: entry.label,
    at: entry.at,
    status: entry.status === "waiting" ? "upcoming" : entry.status,
    detail: entry.detail,
    previewOnly: true,
  }));
}
