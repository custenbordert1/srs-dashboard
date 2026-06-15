import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  matchesMyWorkFocus,
  summarizeCandidateTableFilters,
} from "@/lib/candidate-focus-mode";

function sample(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Pat",
    lastName: "Lee",
    email: "pat@example.com",
    phone: "",
    source: "Indeed",
    stage: "applied",
    appliedDate: "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-20",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "",
    hasResume: false,
  };
}

describe("candidate-focus-mode", () => {
  it("matches my-work when owned, follow-up, paperwork, or MEL-ready", () => {
    const base = buildScoredWorkflowRow(sample("c1"));
    const owned = { ...base, assignedRecruiter: "Taylor" };
    assert.equal(matchesMyWorkFocus(owned, "Taylor"), true);

    const paperwork = {
      ...base,
      assignedRecruiter: "Other",
      workflowStatus: "Paperwork Needed" as const,
    };
    assert.equal(matchesMyWorkFocus(paperwork, "Taylor"), true);

    const unrelated = { ...base, assignedRecruiter: "Other", workflowStatus: "Applied" as const };
    assert.equal(matchesMyWorkFocus(unrelated, "Taylor"), false);
  });

  it("summarizes active table filters", () => {
    const summary = summarizeCandidateTableFilters({
      search: "",
      sourceFilter: "__all__",
      stageFilter: "__all__",
      positionFilter: "Merchandiser",
      cityFilter: "__all__",
      stateFilter: "TX",
      workflowFilter: "__all__",
      matchFilter: "__all__",
      appliedFrom: "",
      appliedTo: "",
      recruiterQuickFilter: "all",
      focusMode: "my-work",
      actingRecruiter: "Taylor",
    });
    assert.match(summary, /My work/);
    assert.match(summary, /Position: Merchandiser/);
    assert.match(summary, /State: TX/);
  });
});
