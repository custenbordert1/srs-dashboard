import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBreezyEnvironmentValidation } from "@/lib/breezy-environment-validation";

function loadEnvLocal(): void {
  const envPath = path.resolve(".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  try {
    loadEnvLocal();
  } catch {
    console.warn("No .env.local found — using process environment only.");
  }

  const report = await buildBreezyEnvironmentValidation({ rerunP92OnSuccess: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p92-1-breezy-environment-validation.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        overallOk: report.overallOk,
        authentication: report.authentication,
        missingRequired: report.missingRequired,
        environmentVariables: report.environmentVariables,
        rateLimits: report.rateLimits,
        permissions: report.permissions,
        liveFetches: report.liveFetches,
        endpointProbes: report.endpointProbes.map((p) => ({
          endpoint: p.endpoint,
          success: p.success,
          error: p.error,
        })),
        failureReason: report.failureReason,
        p92RerunSummary: report.p92RerunSummary,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);

  if (!report.overallOk) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
