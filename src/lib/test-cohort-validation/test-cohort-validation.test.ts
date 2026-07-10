import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import {
  matchTestApplicantToCandidates,
  P103_TEST_APPLICANTS,
  resolveBestApplicantMatch,
  validateCohortEmail,
} from "@/lib/test-cohort-validation";
import { buildTestCohortValidation } from "@/lib/test-cohort-validation/build-test-cohort-validation";

function sampleCandidate(patch: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "c-tyesha",
    firstName: "Tyesha",
    lastName: "Evans",
    email: "kayvon05@gmial.com",
    phone: "7244987963",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-06-10",
    createdDate: "2026-06-10",
    addedDate: "2026-06-10",
    updatedDate: "2026-06-10",
    addedDateSource: "creation_date",
    positionId: "pos-wash-pa",
    positionName: "Retail Merchandiser - Western PA & WV Area",
    city: "Washington",
    state: "PA",
    zipCode: "15301",
    resumeText: "Retail merchandiser",
    hasResume: true,
    questionnaireAnswers: [{ question: "smartphone", answer: "Yes" }],
    hasQuestionnaire: true,
    ...patch,
  };
}

describe("test-cohort-validation (P103)", () => {
  it("flags Tyesha gmial.com email as invalid typo domain", () => {
    const result = validateCohortEmail("kayvon05@gmial.com");
    assert.equal(result.valid, false);
    assert.match(result.reason ?? "", /gmial\.com/);
  });

  it("accepts well-formed gmail addresses", () => {
    const result = validateCohortEmail("malcolmjcoope0809@gmail.com");
    assert.equal(result.valid, true);
    assert.equal(result.reason, null);
  });

  it("matches applicants by email with supporting signals", () => {
    const tyesha = P103_TEST_APPLICANTS.find((a) => a.key === "tyesha-evans");
    assert.ok(tyesha);
    const candidates = [
      sampleCandidate(),
      sampleCandidate({
        candidateId: "c-other",
        email: "other@example.com",
        firstName: "Other",
        lastName: "Person",
      }),
    ];
    const matches = matchTestApplicantToCandidates(tyesha, candidates);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.candidate.candidateId, "c-tyesha");
    assert.ok(matches[0]?.signals.includes("email"));
    assert.ok(matches[0]?.signals.includes("phone"));
    assert.ok(matches[0]?.signals.includes("name"));
  });

  it("resolves Washington PA cluster applicants to distinct candidates", () => {
    const clusterApplicants = P103_TEST_APPLICANTS.filter(
      (a) => a.cluster === "washington_pa_retail_merchandiser",
    );
    assert.equal(clusterApplicants.length, 4);

    const candidates = clusterApplicants.map((applicant, index) =>
      sampleCandidate({
        candidateId: `c-wash-${index}`,
        firstName: applicant.name.split(" ")[0] ?? "",
        lastName: applicant.name.split(" ").slice(1).join(" "),
        email: applicant.email,
        phone: applicant.phone.replace(/\D/g, ""),
      }),
    );

    const matchedIds = new Set<string>();
    for (const applicant of clusterApplicants) {
      const { best, ambiguous } = resolveBestApplicantMatch(applicant, candidates);
      assert.equal(ambiguous, false);
      assert.ok(best);
      matchedIds.add(best.candidate.candidateId);
    }
    assert.equal(matchedIds.size, 4);
  });

  it("builds preview report with invalid email count for Tyesha cohort", () => {
    const tyeshaApplicant = P103_TEST_APPLICANTS.find((a) => a.key === "tyesha-evans");
    assert.ok(tyeshaApplicant);
    const candidate = sampleCandidate();
    const row = buildScoredWorkflowRow(candidate, {
      candidateId: candidate.candidateId,
      workflowStatus: "Applied",
      assignedRecruiter: "Unassigned",
      assignedDM: "Unassigned",
      notes: [],
      history: [],
    });

    const report = buildTestCohortValidation({
      candidates: [candidate],
      rowsByCandidateId: new Map([[candidate.candidateId, row]]),
      jobsByPositionId: new Map([
        [
          "pos-wash-pa",
          {
            jobId: "pos-wash-pa",
            name: "Retail Merchandiser - Western PA & WV Area",
            city: "Washington",
            state: "PA",
            zip: "",
            displayLocation: "Washington, PA",
            locationSource: "missing",
            status: "published",
            createdDate: "",
            updatedDate: "",
          },
        ],
      ]),
      workflows: {},
      rosters: { recruiters: ["Taylor"], dms: [] },
      onboardingByCandidateId: new Map(),
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    });

    const tyeshaResult = report.applicants.find((a) => a.applicantKey === "tyesha-evans");
    assert.ok(tyeshaResult);
    assert.equal(tyeshaResult.matchStatus, "matched");
    assert.equal(tyeshaResult.contact.emailValid, false);
    assert.equal(tyeshaResult.paperworkSendEligible, false);
    assert.equal(report.metrics.invalidEmailCount, 1);
    assert.equal(report.safetyConfirmation.noSends, true);
    assert.equal(report.safetyConfirmation.noBreezyWrites, true);
    assert.equal(report.safetyConfirmation.noDropboxCalls, true);
  });
});
