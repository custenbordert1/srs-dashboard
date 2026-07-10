import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagnoseApplicantBlockers } from "@/lib/test-cohort-auto-advance/diagnose-applicant-blockers";
import { isP105PersistenceCandidate } from "@/lib/test-cohort-auto-advance/build-test-cohort-persistence";
import { P103_TEST_APPLICANTS } from "@/lib/test-cohort-validation/test-applicants";

describe("test-cohort-auto-advance (P105)", () => {
  it("blocks Tyesha Evans persistence for invalid email", () => {
    const applicant = P103_TEST_APPLICANTS.find((a) => a.key === "tyesha-evans")!;
    const gate = isP105PersistenceCandidate({
      applicant,
      candidateId: "ce187a7283ec",
    });
    assert.equal(gate.allowed, false);
    assert.match(gate.reason ?? "", /gmial\.com/);
  });

  it("blocks John Sykes from persistence", () => {
    const applicant = P103_TEST_APPLICANTS.find((a) => a.key === "john-sykes")!;
    const gate = isP105PersistenceCandidate({
      applicant,
      candidateId: "9f8231817090",
    });
    assert.equal(gate.allowed, false);
  });

  it("diagnoses missing recruiter and P97 cohort", () => {
    const diagnosis = diagnoseApplicantBlockers({
      row: {
        candidateId: "c0c920caa44f",
        assignedRecruiter: "Unassigned",
        assignedDM: "Unassigned",
        workflowStatus: "Applied",
        actionType: null,
        paperworkStatus: "not_sent",
        signatureRequestId: null,
      } as never,
      onboarding: null,
      jobsByPositionId: new Map(),
      inP97Cohort: false,
      alreadySent: false,
      applicantEmail: "malcolmjcoope0809@gmail.com",
    });
    assert.equal(diagnosis.missingRecruiterAssignment, true);
    assert.equal(diagnosis.notInP97Cohort, true);
    assert.equal(diagnosis.invalidEmail, false);
  });
});
