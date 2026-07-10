/**
 * P176.1 — Post-Assignment Paperwork Eligibility Validation (read-only)
 *
 * Usage: npx tsx scripts/p176.1-post-assignment-paperwork-validation.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP1761PostAssignmentReport } from "@/lib/p176.1-post-assignment-paperwork-validation/build-post-assignment-validation";
import { formatP1761Markdown } from "@/lib/p176.1-post-assignment-paperwork-validation/format-report";

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
  const report = await buildP1761PostAssignmentReport();

  const jsonPath = path.join(
    process.cwd(),
    "artifacts",
    "p176.1-post-assignment-paperwork-validation.json",
  );
  const mdPath = path.join(
    process.cwd(),
    "artifacts",
    "p176.1-post-assignment-paperwork-validation.md",
  );
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1761Markdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        readOnly: true,
        summary: report.summary,
        patriciaIrby: report.patriciaIrby,
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
