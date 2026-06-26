import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { buildAutonomousPaperworkDashboard } from "@/lib/autonomous-paperwork-engine/build-autonomous-paperwork-dashboard";
import type {
  AutonomousPaperworkDashboardSnapshot,
  AutonomousPaperworkPreviewResult,
} from "@/lib/autonomous-paperwork-engine/types";
import { P70_PREVIEW_MODE } from "@/lib/autonomous-paperwork-engine/types";

/**
 * Read-only preview runner — never calls Dropbox Sign, sends email, or mutates records.
 */
export function runAutonomousPaperworkPreview(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  fetchedAt?: string;
}): AutonomousPaperworkPreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildAutonomousPaperworkDashboard({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    fetchedAt,
  });

  const warnings = [
    "Preview mode — no Dropbox Sign calls, no live emails, no automatic execution.",
    "Paperwork intelligence is read-only visibility over workflow and onboarding records.",
  ];

  return {
    ok: true,
    previewMode: P70_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    warnings,
  };
}

export type { AutonomousPaperworkDashboardSnapshot };
