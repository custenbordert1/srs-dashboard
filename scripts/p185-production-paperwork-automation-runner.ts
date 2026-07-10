/**
 * P185 Production Paperwork Automation Runner — CLI entry.
 *
 * Usage:
 *   npx tsx scripts/p185-production-paperwork-automation-runner.ts --dry-run
 *   npx tsx scripts/p185-production-paperwork-automation-runner.ts --live
 *   npx tsx scripts/p185-production-paperwork-automation-runner.ts --reconcile-only
 *   npx tsx scripts/p185-production-paperwork-automation-runner.ts --health
 *   npx tsx scripts/p185-production-paperwork-automation-runner.ts --dry-run --max-candidates 50 --max-sends 5
 *
 * Company-hosted cron example (every 10 minutes):
 *   Use schedule "every 10 min" with:
 *   cd /path/to/srs-dashboard && CRON_SECRET=... npx tsx scripts/p185-production-paperwork-automation-runner.ts --dry-run
 *
 * Or hit the HTTP endpoint with Authorization Bearer CRON_SECRET.
 *
 * Safety: CLI still honors production gates. --live does not bypass kill switch,
 * durable storage, P184 enabled/mode, or dry-run validation requirements.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildP185HealthReport,
  buildP185ValidationReport,
  formatP185Markdown,
  runP185ProductionPaperworkAutomation,
  setP185StorageTestFlags,
} from "../src/lib/p185-production-paperwork-automation-runner";

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const dryRun = argFlag("--dry-run");
  const live = argFlag("--live");
  const reconcileOnly = argFlag("--reconcile-only");
  const healthOnly = argFlag("--health");
  const maxCandidates = Number(argValue("--max-candidates")) || undefined;
  const maxSends = Number(argValue("--max-sends")) || undefined;
  const writeArtifacts = argFlag("--write-artifacts") || dryRun || healthOnly;

  // Local CLI defaults to durable filesystem for operator tooling.
  if (!process.env.VERCEL) {
    setP185StorageTestFlags({ forceDurable: true });
  }

  if (healthOnly) {
    const health = await buildP185HealthReport();
    console.log(JSON.stringify(health, null, 2));
    if (writeArtifacts) await writeValidation(health);
    return;
  }

  const intent = reconcileOnly
    ? "reconcile_only"
    : live
      ? "live"
      : dryRun
        ? "dry_run"
        : "dry_run";

  const result = await runP185ProductionPaperworkAutomation({
    intent,
    maxCandidates,
    maxSends,
  });

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        skipped: result.skipped,
        skipReason: result.skipReason,
        mode: result.mode,
        cycle: result.cycle,
        lease: result.lease,
        storageDurable: result.storageDurable,
        reconciliation: result.reconciliation,
        p184: result.p184
          ? {
              evaluated: result.p184.evaluated,
              eligible: result.p184.eligible,
              sent: result.p184.sent,
              failed: result.p184.failed,
            }
          : null,
      },
      null,
      2,
    ),
  );

  if (writeArtifacts) {
    const health = await buildP185HealthReport();
    await writeValidation(health, result);
  }
}

async function writeValidation(
  health: Awaited<ReturnType<typeof buildP185HealthReport>>,
  result?: Awaited<ReturnType<typeof runP185ProductionPaperworkAutomation>>,
): Promise<void> {
  const report = buildP185ValidationReport({
    dryRunCycleResults: result
      ? {
          skipped: result.skipped,
          skipReason: result.skipReason,
          mode: result.mode,
          evaluated: result.cycle?.evaluated ?? null,
          eligible: result.cycle?.eligible ?? null,
          sent: result.cycle?.sent ?? null,
        }
      : { healthOnly: true },
    productionBlockers: health.liveEnablementBlockers,
    liveEnablementReadiness: health.liveEnablementReady,
    warnings: result?.healthHints ?? [],
  });
  const dir = path.join(process.cwd(), "artifacts");
  await mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, "p185-production-paperwork-runner-validation.json");
  const mdPath = path.join(dir, "p185-production-paperwork-runner-validation.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP185Markdown(report), "utf8");
  console.error(`Wrote ${jsonPath}`);
  console.error(`Wrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
