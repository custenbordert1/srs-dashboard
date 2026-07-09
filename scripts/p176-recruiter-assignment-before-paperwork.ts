/**
 * P176 — Recruiter Assignment Before Paperwork Eligibility
 *
 * Usage:
 *   npx tsx scripts/p176-recruiter-assignment-before-paperwork.ts           # live (workflow store)
 *   npx tsx scripts/p176-recruiter-assignment-before-paperwork.ts --dryRun
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatP176Markdown } from "@/lib/p176-recruiter-assignment-before-paperwork/format-report";
import { runP176RecruiterAssignmentBeforePaperwork } from "@/lib/p176-recruiter-assignment-before-paperwork/run-recruiter-assignment-before-paperwork";

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
  const dryRun = process.argv.includes("--dryRun");

  const report = await runP176RecruiterAssignmentBeforePaperwork({
    dryRun,
    byUserId: "p176-recruiter-assignment-script",
  });

  const jsonPath = path.join(process.cwd(), "artifacts", "p176-recruiter-assignment-before-paperwork.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p176-recruiter-assignment-before-paperwork.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP176Markdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: report.dryRun,
        summary: report.summary,
        conclusion: report.conclusion,
        rollbackPath: report.rollbackPath,
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
