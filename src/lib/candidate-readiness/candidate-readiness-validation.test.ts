import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCandidateIntelligenceBundle } from "@/lib/candidate-readiness/build-candidate-intelligence";
import { CANDIDATE_READINESS_VALIDATION_FIXTURES } from "@/lib/candidate-readiness/candidate-readiness-validation-fixtures";

describe("candidate-readiness validation", () => {
  it("validates 12 realistic Breezy-shaped candidate profiles", () => {
    assert.ok(CANDIDATE_READINESS_VALIDATION_FIXTURES.length >= 10);

    for (const fixture of CANDIDATE_READINESS_VALIDATION_FIXTURES) {
      const bundle = buildCandidateIntelligenceBundle(fixture.candidate);
      const { grade, resume, questionnaire } = bundle;

      assert.ok(
        fixture.expectedGrade.includes(grade.grade),
        `${fixture.id}: expected grade ${fixture.expectedGrade.join("/")}, got ${grade.grade} (${grade.overallScore})`,
      );
      assert.equal(
        grade.confidence,
        fixture.expectedConfidence,
        `${fixture.id}: expected confidence ${fixture.expectedConfidence}, got ${grade.confidence}`,
      );

      if (fixture.minScore !== undefined) {
        assert.ok(
          grade.overallScore >= fixture.minScore,
          `${fixture.id}: score ${grade.overallScore} below min ${fixture.minScore}`,
        );
      }
      if (fixture.maxScore !== undefined) {
        assert.ok(
          grade.overallScore <= fixture.maxScore,
          `${fixture.id}: score ${grade.overallScore} above max ${fixture.maxScore}`,
        );
      }

      if (resume.available && questionnaire.available) {
        assert.equal(grade.confidence, "high");
      } else if (resume.available || questionnaire.available) {
        assert.equal(grade.confidence, "medium");
      }

      assert.ok(grade.gradeContributors.length > 0 || grade.confidence === "low");
      assert.ok(grade.recommendedNextAction.length > 0);
      assert.ok(!grade.recommendedNextAction.toLowerCase().includes("breezy"));

      if (resume.available) {
        assert.ok(resume.quality.completeness !== "unavailable");
      }
    }
  });

  it("ranks strong profiles above sparse profiles", () => {
    const scores = Object.fromEntries(
      CANDIDATE_READINESS_VALIDATION_FIXTURES.map((fixture) => [
        fixture.id,
        buildCandidateIntelligenceBundle(fixture.candidate).grade.overallScore,
      ]),
    );

    assert.ok(scores["strong-full"]! > scores["sparse-applicant"]!);
    assert.ok(scores["vendor-veteran"]! > scores["new-applicant"]!);
    assert.ok(scores["tech-fail"]! <= scores["strong-full"]!);
  });
});
