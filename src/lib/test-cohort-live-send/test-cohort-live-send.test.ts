import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePositionTitle,
  positionTitlesMatch,
  detectPositionTitleEncodingIssue,
} from "@/lib/test-cohort-validation/normalize-position-title";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import { classifyApplicantSendReadiness } from "@/lib/test-cohort-live-send/classify-applicant-send-readiness";
import { P103_TEST_APPLICANTS } from "@/lib/test-cohort-validation/test-applicants";

describe("normalize-position-title", () => {
  it("matches hyphen and en-dash variants", () => {
    const expected = "Retail Merchandiser - West Richfield, OH";
    const actual = "Retail Merchandiser – West Richfield, OH";
    assert.equal(positionTitlesMatch(expected, actual), true);
    assert.equal(normalizePositionTitle(expected), normalizePositionTitle(actual));
  });

  it("flags encoding mismatch with normalized match", () => {
    const issue = detectPositionTitleEncodingIssue(
      "Retail Merchandiser - West Richfield, OH",
      "Retail Merchandiser – West Richfield, OH",
    );
    assert.equal(issue.hasEncodingMismatch, true);
  });
});

describe("test-cohort-live-send (P104)", () => {
  it("blocks Tyesha Evans for gmial.com typo", () => {
    const applicant = P103_TEST_APPLICANTS.find((a) => a.key === "tyesha-evans")!;
    const email = validateCohortEmail(applicant.email);
    assert.equal(email.valid, false);

    const readiness = classifyApplicantSendReadiness({
      applicant,
      validation: {
        applicantKey: applicant.key,
        applicantName: applicant.name,
        matchStatus: "matched",
        matchSignals: ["email"],
        matchScore: 100,
        candidateId: "ce187a7283ec",
        breezyId: "ce187a7283ec",
        positionId: "2516778d8637",
        duplicateStatus: "none",
        duplicateDetail: null,
        contact: { emailValid: false, emailReason: email.reason, phoneValid: true, phoneReason: null },
        jobStatus: "published",
        recruiter: null,
        dm: null,
        workflowStatus: "Applied",
        actionType: null,
        p62: null,
        p83: null,
        p84: null,
        p87: null,
        p99: null,
        p100DryRun: null,
        paperworkSendEligible: false,
        blockerReason: email.reason,
        recommendation: "Block",
        cluster: applicant.cluster ?? null,
      },
      row: null,
      storePositionTitle: applicant.positionTitle,
      onboarding: null,
      jobsByPositionId: new Map(),
      p97PersistedIds: new Set(),
      p100SentIds: new Set(),
    });

    assert.equal(readiness.category, "invalid_email");
    assert.equal(readiness.safeToSendNow, false);
  });
});
