import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  P193_4_MIN_QUALIFIED_TO_BRIDGE,
  evaluateP1934Calibration,
  parseExperienceYears,
  resolveP1934QualificationField,
  selectP1934PilotCohort,
  cohortFingerprint,
} from "@/lib/p193-4-qualification-calibration";
import { projectQualifiedToP192Prerequisites } from "@/lib/p193-simplified-autonomous-lifecycle/paperworkBridge";
import { createP193Record } from "@/lib/p193-simplified-autonomous-lifecycle/recordFactory";
import { DEFAULT_P193_FLAGS } from "@/lib/p193-simplified-autonomous-lifecycle/types";

function cand(partial: Partial<BreezyCandidate> & { candidateId: string }): BreezyCandidate {
  return {
    firstName: "A",
    lastName: "B",
    email: `${partial.candidateId}@example.com`,
    phone: "5551112222",
    stage: "Applied",
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    hasResume: true,
    resumeText: "x".repeat(50),
    hasQuestionnaire: true,
    questionnaireAnswers: [
      {
        question: "How many years of professional merchandising experience do you have?",
        answer: "6–10 years",
      },
      {
        question: "Do you own an updated Android smartphone or iPhone?",
        answer: "Yes, iPhone",
      },
      {
        question: "Do you have reliable internet access on your smartphone?",
        answer: "Yes",
      },
      {
        question: "Are you comfortable installing and using third-party apps?",
        answer: "Yes",
      },
      {
        question: "Some projects require submitting 50–100+ photos",
        answer: "Yes",
      },
      {
        question: "All projects are time sensitive",
        answer: "Yes",
      },
      {
        question: "learn new tools and apps",
        answer: "Yes",
      },
      {
        question: "reliable transportation, a valid non-expired driver’s license, and are you 18",
        answer: "Yes",
      },
      {
        question: "check your email daily and log in to our system",
        answer: "Yes",
      },
      {
        question: "Physical Requirements — Please confirm which apply",
        answer: "I am able to stand for extended periods",
      },
      {
        question: "What type of work is this?",
        answer: "1099 independent contract work — I understand I am responsible for my own taxes",
      },
    ],
    positionId: `job-${partial.candidateId}`,
    positionName: "Merchandiser Austin",
    appliedDate: "2026-07-01",
    source: "Indeed",
    ...partial,
  } as BreezyCandidate;
}

describe("P193.4 qualification calibration", () => {
  it("separates hard gates from weighted factors and never auto-rejects", () => {
    const result = evaluateP1934Calibration({
      candidate: cand({
        candidateId: "good1",
        mappedFields: undefined,
      }),
      mappedFields: {
        merchandising_experience: "6–10 years",
        smartphone_ownership: "Yes, iPhone",
        reliable_smartphone_internet: "Yes",
        comfort_installing_apps: "Yes",
        photo_and_survey_capability: "Yes",
        scheduling_deadline_acknowledgement: "Yes",
        willingness_to_learn_tools: "Yes",
        transportation_license_age: "Yes",
        daily_email_system_check: "Yes",
        physical_capability: "I am able to stand",
        independent_contractor_acknowledgement:
          "1099 independent contract work — I understand I am responsible for my own taxes",
      },
    });
    assert.equal(result.hardGates.length, 0);
    assert.ok(["Qualified", "Needs Human Review", "Request More Information"].includes(result.decision));
    assert.notEqual(result.decision as string, "Not Qualified");
  });

  it("fail-closes explicit disqualifying responses to Needs Human Review", () => {
    const result = evaluateP1934Calibration({
      candidate: cand({ candidateId: "bad1" }),
      mappedFields: {
        merchandising_experience: "3–5 years",
        smartphone_ownership: "Yes",
        reliable_smartphone_internet: "Yes",
        comfort_installing_apps: "Yes",
        photo_and_survey_capability: "Yes",
        scheduling_deadline_acknowledgement: "Yes",
        willingness_to_learn_tools: "Yes",
        transportation_license_age: "Yes",
        daily_email_system_check: "Yes",
        physical_capability: "able",
        independent_contractor_acknowledgement: "W-2 employee",
      },
    });
    assert.ok(result.hardGates.includes("explicit_disqualify_employment_type"));
    assert.equal(result.decision, "Needs Human Review");
  });

  it("parses experience years and maps new prequalify IDs", () => {
    assert.equal(parseExperienceYears("6–10 years"), 8);
    assert.equal(parseExperienceYears("More than 10 years"), 12);
    const mapped = resolveP1934QualificationField({
      questionId: "4aeb15a3c56b",
      questionText: "Do you use a smart device/phone/tablet?",
    });
    assert.equal(mapped.field, "smartphone_ownership");
    assert.equal(mapped.mappedBy, "question_id");
  });

  it("requires minimum 3 Qualified to bridge and freezes cohort fingerprint", () => {
    assert.equal(P193_4_MIN_QUALIFIED_TO_BRIDGE, 3);
    const candidates = [1, 2, 3, 4, 5].map((i) =>
      cand({
        candidateId: `q${i}`,
        email: `q${i}@example.com`,
        positionId: `job-${i}`,
        state: i % 2 === 0 ? "TX" : "OH",
      }),
    );
    const workflows = Object.fromEntries(
      candidates.map((c) => [
        c.candidateId,
        {
          candidateId: c.candidateId,
          workflowStatus: "Applied",
          notes: [],
          assignedRecruiter: "Unassigned",
          paperworkStatus: "not_sent",
          signatureRequestId: null,
          paperworkSentAt: null,
          history: [],
        },
      ]),
    );
    const records = Object.fromEntries(
      candidates.map((c) => [
        c.candidateId,
        {
          mappedQualificationFields: {
            merchandising_experience: "More than 10 years",
            smartphone_ownership: "Yes, Android",
            reliable_smartphone_internet: "Yes",
            comfort_installing_apps: "Yes",
            photo_and_survey_capability: "Yes",
            scheduling_deadline_acknowledgement: "Yes",
            willingness_to_learn_tools: "Yes",
            transportation_license_age: "Yes",
            daily_email_system_check: "Yes",
            physical_capability: "I am able to stand",
            independent_contractor_acknowledgement: "1099 independent contract work",
          },
        },
      ]),
    );
    const { cohort, counts } = selectP1934PilotCohort({
      candidates,
      workflows: workflows as never,
      recordsById: records as never,
    });
    assert.ok(cohort.immutable);
    assert.equal(cohortFingerprint(cohort.members.map((m) => m.candidateId)), cohort.fingerprint);
    assert.ok(counts.Qualified + counts["Needs Human Review"] + counts["Request More Information"] <= 10);
  });

  it("bridge projection remains P192-compatible without send/MEL", () => {
    const record = createP193Record({ candidateId: "b1", state: "Qualified" });
    const projection = projectQualifiedToP192Prerequisites({
      record,
      flags: { ...DEFAULT_P193_FLAGS, enabled: true, paperworkBridgeEnabled: true },
      authorized: true,
    });
    assert.equal(projection.patch?.workflowStatus, "Paperwork Needed");
    assert.equal(/mel_export|dropbox_sign_send/i.test(JSON.stringify(projection)), false);
  });

  it("does not reduce Qualified threshold below 90 in model version", () => {
    const weak = evaluateP1934Calibration({
      candidate: cand({ candidateId: "weak1", resumeText: "short", hasResume: true }),
      mappedFields: {
        merchandising_experience: "Less than 1 year",
        smartphone_ownership: "Yes",
        reliable_smartphone_internet: "Yes",
        comfort_installing_apps: "Yes",
        photo_and_survey_capability: "Yes",
        scheduling_deadline_acknowledgement: "Yes",
        willingness_to_learn_tools: "Yes",
        transportation_license_age: "Yes",
        daily_email_system_check: "Yes",
        physical_capability: "able",
        independent_contractor_acknowledgement: "1099 independent contract work",
      },
    });
    if (weak.confidence < 90) assert.notEqual(weak.decision, "Qualified");
  });
});
