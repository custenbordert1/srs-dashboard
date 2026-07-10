import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildP160OverallScore,
  buildP160Recommendation,
} from "@/lib/p160-production-readiness/build-risk-and-recommendation";
import { aggregateLevel, levelToScore, weightedScore } from "@/lib/p160-production-readiness/scoring";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";

describe("P160 production readiness", () => {
  it("maps readiness levels to scores", () => {
    assert.equal(levelToScore("ready"), 100);
    assert.equal(levelToScore("warning"), 60);
    assert.equal(levelToScore("blocked"), 0);
  });

  it("aggregates blocked over warning over ready", () => {
    assert.equal(aggregateLevel(["ready", "warning"]), "warning");
    assert.equal(aggregateLevel(["ready", "blocked"]), "blocked");
    assert.equal(aggregateLevel(["ready", "ready"]), "ready");
  });

  it("computes weighted scores", () => {
    const score = weightedScore([
      { weight: 50, level: "ready" },
      { weight: 50, level: "blocked" },
    ]);
    assert.equal(score, 50);
  });

  it("does not enable continuous mode by default", () => {
    assert.equal(isP154ContinuousEnabled({}), false);
  });

  it("recommends not_ready when critical risks exist", () => {
    const result = buildP160Recommendation({
      score: 90,
      risks: {
        critical: [
          {
            id: "x",
            severity: "critical",
            title: "Missing secret",
            detail: "d",
            mitigation: "m",
          },
        ],
        high: [],
        medium: [],
        low: [],
      },
      infrastructure: {
        buildStatus: "ready",
        buildDetail: "",
        nodeVersion: "v20",
        nodeCompatible: true,
        serverCompatibility: "",
        runtimeHealth: "ready",
        environmentVariables: [],
        secretsConfigured: [],
      },
      integrations: { overall: "ready", items: [] },
      automation: { overall: "ready", phases: [] },
      continuousEnabled: false,
    });
    assert.equal(result.recommendation, "not_ready");
  });

  it("computes overall score from section inputs", () => {
    const score = buildP160OverallScore({
      infrastructure: {
        buildStatus: "ready",
        buildDetail: "",
        nodeVersion: "v20",
        nodeCompatible: true,
        serverCompatibility: "",
        runtimeHealth: "ready",
        environmentVariables: [],
        secretsConfigured: [{ id: "a", label: "A", status: "ready", detail: "" }],
      },
      integrations: { overall: "ready", items: [] },
      automation: {
        overall: "ready",
        phases: [
          { phase: "P154", label: "P154", status: "ready", detail: "" },
          { phase: "P155", label: "P155", status: "ready", detail: "" },
        ],
      },
      safety: {
        overall: "ready",
        items: [{ id: "a", label: "A", status: "ready", detail: "" }],
      },
      deploymentScore: 80,
    });
    assert.ok(score >= 80);
  });
});
