import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { DataQualityIssue } from "@/lib/production-readiness/types";

export function buildDataQualitySnapshot(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  opportunities: MelOpportunity[];
  syncFailures: string[];
  fetchedAt: string;
}): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const referenceMs = Date.parse(input.fetchedAt) || Date.now();
  const staleMs = 30 * 24 * 60 * 60 * 1000;

  const missingTerritoryJobs = input.jobs.filter((job) => !normalizeStateCode(job.state)).length;
  const missingTerritoryCandidates = input.candidates.filter(
    (candidate) => !normalizeStateCode(candidate.state),
  ).length;
  if (missingTerritoryJobs + missingTerritoryCandidates > 0) {
    issues.push({
      id: "territory-mapping",
      category: "territory-mapping",
      severity: "warning",
      title: "Missing territory mappings",
      detail: `${missingTerritoryJobs} jobs and ${missingTerritoryCandidates} candidates lack valid state codes`,
      count: missingTerritoryJobs + missingTerritoryCandidates,
    });
  }

  const emailCounts = new Map<string, number>();
  for (const candidate of input.candidates) {
    const email = candidate.email?.trim().toLowerCase();
    if (!email) continue;
    emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }
  const duplicateEmails = [...emailCounts.values()].filter((count) => count > 1).length;
  if (duplicateEmails > 0) {
    issues.push({
      id: "duplicate-candidates",
      category: "duplicate-candidate",
      severity: "warning",
      title: "Duplicate candidate emails",
      detail: `${duplicateEmails} email addresses appear on multiple candidate records`,
      count: duplicateEmails,
    });
  }

  let invalidAssignments = 0;
  if (input.workflows) {
    for (const candidate of input.candidates) {
      const workflow = input.workflows[candidate.candidateId];
      if (!workflow) continue;
      if (isUnassignedRecruiter(workflow.assignedRecruiter ?? "")) invalidAssignments += 1;
    }
  }
  if (invalidAssignments > 0) {
    issues.push({
      id: "invalid-assignments",
      category: "invalid-assignment",
      severity: "warning",
      title: "Unassigned recruiters",
      detail: `${invalidAssignments} active workflows have no recruiter assigned`,
      count: invalidAssignments,
    });
  }

  const staleOpportunities = input.opportunities.filter((row) => {
    if (!row.openStatus) return false;
    return false;
  }).length;
  const openUnstaffed = input.opportunities.filter((row) => row.openStatus && !row.isStaffed).length;
  if (openUnstaffed > 0) {
    issues.push({
      id: "stale-opportunities",
      category: "stale-opportunity",
      severity: openUnstaffed >= 10 ? "critical" : "warning",
      title: "Open unstaffed opportunities",
      detail: `${openUnstaffed} MEL opportunities are open and unstaffed`,
      count: openUnstaffed,
    });
  }
  void staleOpportunities;
  void staleMs;
  void referenceMs;

  for (const failure of input.syncFailures) {
    issues.push({
      id: `sync:${failure}`,
      category: "sync-failure",
      severity: "critical",
      title: "Sync failure",
      detail: failure,
      count: 1,
    });
  }

  return issues;
}
