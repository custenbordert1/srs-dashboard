import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enrichBreezyCandidateWithQuestionnairePayload, type BreezyCandidate } from "@/lib/breezy-api";
import { resolveCandidateHasResume } from "@/lib/recruiting-intelligence/resume-assets";

function tyreeStored(): BreezyCandidate {
  return {
    candidateId: "92fa58cc5870",
    firstName: "Tyree nicole",
    lastName: "Gilley",
    email: "tyreenicolegilley932@gmail.com",
    phone: "7754338378",
    source: "Monster",
    stage: "Applied",
    appliedDate: "2026-05-18T14:40:01.601Z",
    createdDate: "2026-05-18T14:40:01.601Z",
    addedDate: "2026-05-18T14:40:01.601Z",
    updatedDate: "",
    addedDateSource: "creation_date",
    positionId: "7959fdf7c9f1",
    positionName: "Retail Merchandiser",
    city: "South Lake Tahoe",
    state: "NV",
    zipCode: "",
    resumeText: "Cashier @ Rainbow Market",
    hasResume: false,
    resumeFields: { headline: "Cashier @ Rainbow Market" },
  };
}

describe("p132-resume-detection-investigation", () => {
  it("explains Tyree headline-only false negative", () => {
    const stored = tyreeStored();
    const legacy = stored.resumeText.length >= 80;
    assert.equal(legacy, false);
    assert.equal(stored.resumeText.length, 24);
  });

  it("fixes hasResume when Breezy documents include resume pdf", () => {
    const enriched = enrichBreezyCandidateWithQuestionnairePayload(tyreeStored(), {
      detail: { headline: "Cashier @ Rainbow Market" },
      questionnaires: [],
      customFields: [],
      documents: [{ file_name: "Tyree_nicoleGilley_Resume.pdf", content_type: "application/pdf" }],
      resume: null,
    });
    assert.equal(enriched.hasResume, true);
    assert.ok((enriched.resumeAssets?.length ?? 0) >= 1);
  });

  it("does not mark hasResume for non-resume documents only", () => {
    const enriched = enrichBreezyCandidateWithQuestionnairePayload(tyreeStored(), {
      detail: { headline: "Cashier @ Rainbow Market" },
      questionnaires: [],
      customFields: [],
      documents: [{ file_name: "id-badge.png", content_type: "image/png" }],
      resume: null,
    });
    assert.equal(
      resolveCandidateHasResume({
        resumeText: enriched.resumeText,
        resumeFields: enriched.resumeFields,
        resumeAssets: enriched.resumeAssets,
      }),
      false,
    );
  });
});
