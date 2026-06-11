import type { AiCommandCenterSnapshot, ExecutiveAiAnswer } from "@/lib/ai-recruiting-command-center/types";

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase();
}

export function answerExecutiveQuestion(
  question: string,
  snapshot: AiCommandCenterSnapshot,
): ExecutiveAiAnswer {
  const q = normalizeQuestion(question);

  if (q.includes("territor") && (q.includes("attention") || q.includes("need"))) {
    const territories = snapshot.territoryAdvisor
      .filter((row) => row.attentionScore >= 50)
      .sort((a, b) => b.attentionScore - a.attentionScore)
      .slice(0, 5);
    const answer =
      territories.length > 0
        ? territories
            .map(
              (row) =>
                `${row.dmName} (attention ${row.attentionScore}): ${row.coverageRiskExplanation}`,
            )
            .join(" ")
        : "All territories are within normal coverage thresholds.";
    return {
      question,
      answer,
      confidence: territories.length > 0 ? 88 : 70,
      relatedInsightIds: territories.map((row) => `territory:${row.dmName}`),
    };
  }

  if (q.includes("hire") && (q.includes("down") || q.includes("why") || q.includes("week"))) {
    const trends = snapshot.briefing.hiringTrends.items.join(" ");
    const wins = snapshot.briefing.topWins.items[0] ?? "No major hiring wins this period.";
    return {
      question,
      answer: `${trends} ${wins} Review applicant velocity and recruiter follow-up SLAs if hires lag targets.`,
      confidence: 82,
      relatedInsightIds: snapshot.insightsFeed
        .filter((row) => row.source === "recruiter-productivity")
        .slice(0, 3)
        .map((row) => row.id),
    };
  }

  if (q.includes("recruiter") && (q.includes("overload") || q.includes("busy") || q.includes("workload"))) {
    const overloaded = snapshot.territoryAdvisor.filter((row) =>
      row.predictedIssues.some((issue) => issue.toLowerCase().includes("workload")),
    );
    const coach = snapshot.recruiterCoach;
    const answer =
      overloaded.length > 0
        ? overloaded
            .map((row) => `${row.dmName}: ${row.predictedIssues.find((i) => i.includes("workload"))}`)
            .join(" ")
        : `${coach.followUpSummary} ${coach.productivityTrend}`;
    return {
      question,
      answer,
      confidence: 80,
      relatedInsightIds: snapshot.insightsFeed
        .filter((row) => row.source === "recruiter-productivity")
        .slice(0, 4)
        .map((row) => row.id),
    };
  }

  if ((q.includes("project") && q.includes("risk")) || q.includes("at risk") || q.includes("open call")) {
    const risks = snapshot.opportunityRisks.slice(0, 5);
    const answer =
      risks.length > 0
        ? risks.map((row) => `${row.projectName} (risk ${row.overallRiskScore}): ${row.explanation}`).join(" ")
        : "No high-risk open projects detected in the current MEL snapshot.";
    return {
      question,
      answer,
      confidence: risks.length > 0 ? 90 : 65,
      relatedInsightIds: risks.map((row) => `opp-risk:${row.opportunityId}`),
    };
  }

  const topInsight = snapshot.insightsFeed[0];
  return {
    question,
    answer: topInsight
      ? `${topInsight.title}: ${topInsight.explanation} Recommended action: ${topInsight.action}.`
      : snapshot.briefing.summary,
    confidence: 60,
    relatedInsightIds: topInsight ? [topInsight.id] : [],
  };
}
