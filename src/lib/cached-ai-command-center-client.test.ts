import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center";
import { primeAiCommandCenterSnapshot } from "@/lib/cached-ai-command-center-client";

function sampleSnapshot(): AiCommandCenterSnapshot {
  return {
    fetchedAt: "2026-05-28T12:00:00.000Z",
    briefing: {
      generatedAt: "2026-05-28T12:00:00.000Z",
      summary: "Test briefing",
      topRisks: { title: "Top risks", items: ["Risk A"] },
      topWins: { title: "Top wins", items: ["Win A"] },
      hiringTrends: { title: "Hiring trends", items: [] },
      coverageChanges: { title: "Coverage", items: [] },
      criticalAlerts: { title: "Critical alerts", items: [] },
    },
    insightsFeed: [],
    territoryAdvisor: [],
    recruiterCoach: {
      pipelineSummary: "Pipeline ok",
      followUpSummary: "Follow-ups due",
      conversionSummary: "Conversion steady",
      productivityTrend: "Stable",
      candidatesToContact: [],
      jobsNeedingApplicants: [],
      followUpsDueToday: [],
    },
    opportunityRisks: [],
    suggestedQuestions: ["What needs attention?"],
  };
}

describe("cached-ai-command-center-client", () => {
  it("primes in-memory cache for subsequent tab loads", async () => {
    primeAiCommandCenterSnapshot(sampleSnapshot());
    const { fetchAiCommandCenterSnapshot } = await import("@/lib/cached-ai-command-center-client");
    const result = await fetchAiCommandCenterSnapshot();
    assert.equal(result.ok, true);
    assert.equal(result.snapshot?.briefing.summary, "Test briefing");
  });
});
