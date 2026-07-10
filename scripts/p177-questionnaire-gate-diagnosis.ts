/**
 * P177 — Questionnaire Gate Diagnosis (read-only)
 *
 * Usage: npx tsx scripts/p177-questionnaire-gate-diagnosis.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP177QuestionnaireGateReport } from "@/lib/p177-questionnaire-gate-diagnosis/build-questionnaire-gate-diagnosis";
import { formatP177Markdown } from "@/lib/p177-questionnaire-gate-diagnosis/format-report";

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
  const report = await buildP177QuestionnaireGateReport();

  const jsonPath = path.join(process.cwd(), "artifacts", "p177-questionnaire-gate-diagnosis.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p177-questionnaire-gate-diagnosis.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP177Markdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        readOnly: true,
        summary: report.summary,
        blockerBreakdown: report.blockerBreakdown,
        recommendedSafestChange: report.recommendedSafestChange,
        patriciaIrby: report.patriciaIrby,
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
