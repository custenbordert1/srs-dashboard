import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_P71_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import {
  buildExecutiveDailyBrief,
  formatExecutiveDailyBriefText,
  runExecutiveDailyBriefPreview,
} from "@/lib/executive-daily-brief";
import { buildDailyBriefNlAnswer } from "@/lib/executive-daily-brief/build-daily-brief-nl-answers";
import { resolveExecutiveQueryId } from "@/lib/executive-natural-language-queries/resolve-executive-query";

const REFERENCE = "2026-06-26T15:00:00.000Z";

function breezyCandidate(id: string, appliedDate: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "",
    source: "Indeed",
    stage: "Applied",
    appliedDate,
    addedDate: appliedDate,
    positionName: "Merchandiser",
    city: "Houston",
    state: "TX",
    positionId: "pos-1",
    jobId: "job-1",
    tags: [],
    customFields: [],
    resumeUrl: "",
    coverLetter: "",
    breezyScore: 0,
  };
}

function workflowRow(id: string): ScoredCandidateWorkflowRow {
  return {
    candidateId: id,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    workflowStatus: "Paperwork Sent",
    paperworkStatus: "sent",
    paperworkSentAt: "2026-06-26T09:00:00.000Z",
    paperworkSignedAt: null,
    assignedRecruiter: "Taylor",
    actionType: "await-signature",
    aiGrade: "B",
    actionGeneratedAt: "2026-06-25T10:00:00.000Z",
  } as ScoredCandidateWorkflowRow;
}

describe("executive-daily-brief", () => {
  it("builds cross-engine metrics in preview mode", () => {
    const candidates = [
      breezyCandidate("c-1", "2026-06-26T10:00:00.000Z"),
      breezyCandidate("c-2", "2026-06-25T10:00:00.000Z"),
      breezyCandidate("c-3", "2026-06-26T11:00:00.000Z"),
    ];

    const brief = buildExecutiveDailyBrief({
      candidates,
      workflowRows: [workflowRow("c-1")],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: DEFAULT_P71_FEATURE_FLAGS,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(brief.previewMode, true);
    assert.equal(brief.metrics.applicantsToday, 2);
    assert.equal(brief.metrics.applicantsYesterday, 1);
    assert.equal(brief.automation.liveSendsEnabled, false);
    assert.ok(brief.summaryText.includes("Recruiting Summary"));
    assert.ok(brief.summaryText.includes("Live Sends: Disabled"));
  });

  it("formats executive summary text", () => {
    const brief = buildExecutiveDailyBrief({
      candidates: [breezyCandidate("c-1", "2026-06-26T10:00:00.000Z")],
      workflowRows: [],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: DEFAULT_P71_FEATURE_FLAGS,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    const text = formatExecutiveDailyBriefText(brief);
    assert.ok(text.includes("Applicants Today:"));
    assert.ok(text.includes("Automation:"));
  });

  it("runs preview without production writes", () => {
    const result = runExecutiveDailyBriefPreview({
      candidates: [breezyCandidate("c-1", "2026-06-26T10:00:00.000Z")],
      workflowRows: [],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: DEFAULT_P71_FEATURE_FLAGS,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(result.ok, true);
    assert.equal(result.previewMode, true);
    assert.ok(result.warnings.some((row) => /preview mode/i.test(row)));
  });

  it("answers natural language brief queries", () => {
    assert.equal(resolveExecutiveQueryId("How are we doing today?"), "brief_how_are_we_doing");
    assert.equal(resolveExecutiveQueryId("Give me today's recruiting summary"), "brief_recruiting_summary");

    const answer = buildDailyBriefNlAnswer({
      queryId: "brief_how_are_we_doing",
      candidates: [breezyCandidate("c-1", "2026-06-26T10:00:00.000Z")],
      workflowRows: [],
      onboardingRecords: [],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      flags: DEFAULT_P71_FEATURE_FLAGS,
      sendQueueMetrics: null,
      fetchedAt: REFERENCE,
    });

    assert.equal(answer?.category, "brief");
    assert.ok(answer?.summary.includes("Recruiting Summary"));
  });
});
