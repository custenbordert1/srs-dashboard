/**
 * P255 — Recover Remaining Eligible Candidates
 *
 * Repairs P254 auto-recoverable candidates (phone/coverage/recruiter/DM).
 * Does NOT send paperwork. Does NOT write Dropbox / Breezy / MEL.
 *
 *   npx tsx scripts/p255-run-recover-eligible-candidates.ts
 *   npx tsx scripts/p255-run-recover-eligible-candidates.ts --dry-run
 *
 * Artifacts:
 *   artifacts/p255-recovery-report.md
 *   artifacts/p255-recovery-report.json
 */
import { existsSync, readFileSync } from "node:fs";
import { runP255RecoverEligibleCandidates } from "@/lib/p255-recover-eligible-candidates";

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
      "[p255] Refusing live/send flags — this mission recovers data only (no paperwork sends).",
    );
    process.exit(2);
  }

  loadEnvLocal();

  const dryRun = argv.includes("--dry-run") || argv.includes("--dryRun");
  console.log(
    `[p255] Recover remaining eligible candidates starting (persist=${!dryRun})…`,
  );

  const result = await runP255RecoverEligibleCandidates({
    persist: !dryRun,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: result.mode,
        totals: result.totals,
        candidates: result.candidates.map((c) => ({
          candidateId: c.candidateId,
          name: c.name,
          repaired: c.repaired,
          nowEligible: c.nowEligible,
          stillBlocked: c.stillBlocked,
          stillBlockedReasons: c.stillBlockedReasons,
          fieldChanges: c.fieldAudits.map((a) => ({
            field: a.field,
            before: a.before,
            after: a.after,
            source: a.source,
            applied: a.applied,
          })),
        })),
        safety: result.safety,
        artifacts: result.artifacts,
        paperworkSends: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
