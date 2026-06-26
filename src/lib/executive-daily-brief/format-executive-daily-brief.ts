import type { ExecutiveDailyBriefSnapshot } from "@/lib/executive-daily-brief/types";

export function formatExecutiveDailyBriefText(brief: ExecutiveDailyBriefSnapshot): string {
  const m = brief.metrics;
  const lines: string[] = [
    brief.greeting,
    "",
    "Recruiting Summary",
    "",
    `Applicants Today: ${m.applicantsToday}`,
    `Paperwork Sent Today: ${m.paperworkSentToday}`,
    `Paperwork Signed Today: ${m.paperworkSignedToday}`,
    `Pending Signatures: ${m.pendingSignatures}`,
    `Ready For Work Today: ${m.readyForWorkToday}`,
    `Human Review: ${m.humanReviewCount}`,
    "",
    "Markets Needing Growth:",
  ];

  if (brief.marketsNeedingGrowth.length === 0) {
    lines.push("No markets flagged for additional hiring in this snapshot.");
  } else {
    for (const market of brief.marketsNeedingGrowth.slice(0, 5)) {
      lines.push(`${market.marketLabel} — Need ${market.recommendedNewReps} rep${market.recommendedNewReps === 1 ? "" : "s"}`);
    }
  }

  lines.push(
    "",
    "Automation:",
    `Paperwork Execution: ${brief.automation.statusLabel}`,
    `Live Sends: ${brief.automation.liveSendsEnabled ? "Enabled" : "Disabled"}`,
    "",
    "Risks:",
  );

  for (const risk of brief.risks) {
    lines.push(`${risk.count} ${risk.label}`);
  }

  lines.push("", `Last refreshed: ${brief.lastDataRefresh}`);

  return lines.join("\n");
}

export function resolveDailyBriefGreeting(referenceMs: number): string {
  const hour = new Date(referenceMs).getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}
