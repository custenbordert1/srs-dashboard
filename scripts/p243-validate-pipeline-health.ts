/**
 * P243 — Pipeline health validation (DRY RUN ONLY).
 *
 * Runs a small before/after dry-run: without reset vs `--force-fresh-reset`,
 * compares qualification, tallies data-quality issues, and writes Ops-ready
 * markdown + JSON artifacts.
 *
 *   node --import tsx scripts/p243-validate-pipeline-health.ts
 *   node --import tsx scripts/p243-validate-pipeline-health.ts --limit=20
 *   node --import tsx scripts/p243-validate-pipeline-health.ts --limit=10 --no-artifact
 *   node --import tsx scripts/p243-validate-pipeline-health.ts --json-stdout
 *
 * Never live-sends. Live flags are refused.
 * No commit / merge / push / deploy.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  formatP243PipelineHealthMarkdown,
  runP243PipelineHealthCheck,
} from "@/lib/autonomous-recruiting-pipeline";

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

function readNumberFlag(argv: string[], name: string, fallback: number): number {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return Math.max(1, Number(inline.slice(`--${name}=`.length)) || fallback);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0) return Math.max(1, Number(argv[idx + 1]) || fallback);
  return fallback;
}

function writeArtifact(name: string, value: unknown): string {
  mkdirSync("artifacts", { recursive: true });
  const target = path.join("artifacts", name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
  return target;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  loadEnvLocal();

  if (
    argv.includes("--live") ||
    argv.includes("--confirm-live") ||
    argv.includes("--confirmLive") ||
    argv.includes("--full-live") ||
    argv.includes("--dry-run=false")
  ) {
    console.error(
      "[P243-health] Live mode is not supported by this health check (dry-run only).",
    );
    process.exit(2);
  }

  const limit = readNumberFlag(argv, "limit", 15);
  const useLLMEnhancement = argv.includes("--llm");
  const writeArtifacts = !argv.includes("--no-artifact");
  const jsonStdout = argv.includes("--json-stdout");

  // Hard-lock: never allow accidental live Dropbox from env bleed-through.
  process.env.DROPBOX_SIGN_TEST_MODE = "true";

  console.log(`[P243-health] DRY RUN ONLY — limit=${limit} forceFreshReset compare enabled`);

  const { report, markdown } = await runP243PipelineHealthCheck({
    limit,
    useLLMEnhancement,
  });

  // Always print concise summary for terminal / Slack paste.
  console.log(markdown.trimEnd());

  if (writeArtifacts) {
    const jsonPath = writeArtifact("p243-pipeline-health.json", report);
    const mdPath = writeArtifact(
      "p243-pipeline-health.md",
      formatP243PipelineHealthMarkdown(report),
    );
    console.log(`[P243-health] artifact=${jsonPath}`);
    console.log(`[P243-health] artifact=${mdPath}`);
  }

  if (jsonStdout) {
    console.log(JSON.stringify(report));
  }

  console.log(
    `[P243-health] advance after=${report.autoAdvance.after.ratePct}% (Δ ${report.autoAdvance.deltaPctPoints >= 0 ? "+" : ""}${report.autoAdvance.deltaPctPoints} pp) freshReset=${report.freshResetApplied}`,
  );
}

main().catch((error) => {
  console.error("[P243-health] fatal:", error);
  process.exit(1);
});
