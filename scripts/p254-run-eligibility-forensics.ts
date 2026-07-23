/**
 * P254 — Why Are No Candidates Eligible? (read-only forensics)
 *
 * Analyzes P253 eligibility exclusions. Does NOT send paperwork.
 * Does NOT modify workflow / Dropbox / Breezy / MEL data.
 *
 *   npx tsx scripts/p254-run-eligibility-forensics.ts
 *
 * Artifacts:
 *   artifacts/p254-eligibility-forensics.md
 *   artifacts/p254-eligibility-forensics.json
 *   artifacts/p254-failure-groups.json
 */
import { existsSync, readFileSync } from "node:fs";
import { runP254EligibilityForensics } from "@/lib/p254-eligibility-forensics";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (
    argv.includes("--live") ||
    argv.includes("--confirm-live") ||
    argv.includes("--confirmLive") ||
    argv.includes("--send")
  ) {
    console.error(
      "[p254] Refusing live/send flags — this mission is read-only forensics only.",
    );
    process.exit(2);
  }

  loadEnvLocal();

  console.log("[p254] Eligibility forensics starting (read-only)…");
  const result = await runP254EligibilityForensics({
    enrichFromDurable: !argv.includes("--artifact-only"),
  });

  const topGroups = result.failureGroups
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((g) => ({ group: g.group, count: g.count }));

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: result.mode,
        totals: result.totals,
        topFailureGroups: topGroups,
        recoverableImpact: result.recoverableImpact.map((r) => ({
          issue: r.label,
          withIssue: r.candidatesWithIssue,
          wouldBecomeEligibleIfFixed: r.wouldBecomeEligibleIfFixed,
        })),
        enrichment: result.enrichment,
        safety: result.safety,
        artifacts: result.artifacts,
        paperworkSends: 0,
        workflowWrites: 0,
        dropboxWrites: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
