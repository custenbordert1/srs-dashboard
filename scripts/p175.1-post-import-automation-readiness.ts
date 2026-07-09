/**
 * P175.1 — Post-Import Automation Readiness Validation (read-only)
 *
 * Usage: npx tsx scripts/p175.1-post-import-automation-readiness.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP1751AutomationReadinessReport } from "@/lib/p175.1-post-import-automation-readiness/build-automation-readiness-validation";
import { formatP1751Markdown } from "@/lib/p175.1-post-import-automation-readiness/format-report";

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

async function main() {
  loadEnvLocal();
  const report = await buildP1751AutomationReadinessReport();

  const jsonPath = path.join(process.cwd(), "artifacts", "p175.1-post-import-automation-readiness.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p175.1-post-import-automation-readiness.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1751Markdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        readOnly: true,
        checks: report.checks,
        paperworkSummary: report.paperworkSummary,
        controlledOperatorSendCycle: report.controlledOperatorSendCycle,
        conclusion: report.conclusion,
        jsonPath,
        mdPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
