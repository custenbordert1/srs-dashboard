import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enrichBreezyCandidateWithQuestionnairePayload, type BreezyCandidate } from "@/lib/breezy-api";
import {
  extractResumeAssetsFromDocumentsPayload,
  extractResumeAssetsFromRaw,
  isResumeFileName,
  resolveCandidateHasResume,
} from "@/lib/recruiting-intelligence/resume-assets";

describe("resume-assets", () => {
  it("detects resume filenames", () => {
    assert.equal(isResumeFileName("Tyree_nicoleGilley_Resume.pdf"), true);
    assert.equal(isResumeFileName("cover-letter.pdf"), true);
    assert.equal(isResumeFileName("id-badge.png"), false);
    assert.equal(isResumeFileName("my-cv.docx"), true);
  });

  it("extracts resume assets from Breezy documents payload", () => {
    const assets = extractResumeAssetsFromDocumentsPayload([
      {
        file_name: "Tyree_nicoleGilley_Resume.pdf",
        content_type: "application/pdf",
        url: "https://example.com/resume.pdf",
      },
      { file_name: "id-badge.png", content_type: "image/png" },
    ]);
    assert.equal(assets.length, 1);
    assert.equal(assets[0]?.fileName, "Tyree_nicoleGilley_Resume.pdf");
    assert.equal(assets[0]?.source, "documents");
  });

  it("marks hasResume true for Tyree-like headline plus uploaded resume asset", () => {
    const hasResume = resolveCandidateHasResume({
      resumeText: "Cashier @ Rainbow Market",
      resumeFields: { headline: "Cashier @ Rainbow Market" },
      resumeAssets: [
        {
          source: "documents",
          fileName: "Tyree_nicoleGilley_Resume.pdf",
          mimeType: "application/pdf",
          url: "https://example.com/resume.pdf",
          parsedTextPreview: null,
        },
      ],
    });
    assert.equal(hasResume, true);
  });

  it("keeps hasResume false when only short headline exists", () => {
    const hasResume = resolveCandidateHasResume({
      resumeText: "Cashier @ Rainbow Market",
      resumeFields: { headline: "Cashier @ Rainbow Market" },
    });
    assert.equal(hasResume, false);
  });

  it("enriches candidate hasResume from documents payload", () => {
    const candidate: BreezyCandidate = {
      candidateId: "92fa58cc5870",
      firstName: "Tyree",
      lastName: "Gilley",
      email: "tyreenicolegilley932@gmail.com",
      phone: "",
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

    const enriched = enrichBreezyCandidateWithQuestionnairePayload(candidate, {
      detail: { headline: "Cashier @ Rainbow Market" },
      questionnaires: [],
      customFields: [],
      documents: [
        {
          file_name: "Tyree_nicoleGilley_Resume.pdf",
          content_type: "application/pdf",
        },
      ],
      resume: null,
    });

    assert.equal(enriched.hasResume, true);
    assert.equal(enriched.resumeAssets?.[0]?.fileName, "Tyree_nicoleGilley_Resume.pdf");
  });
});
