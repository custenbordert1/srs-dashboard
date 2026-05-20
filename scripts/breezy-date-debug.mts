import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { invalidateConfigCache, loadConfigSync } from "../src/lib/config";
import { fetchBreezyCandidatesDebug } from "../src/lib/breezy-api";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadDotEnvLocal();
  invalidateConfigCache();
  loadConfigSync();

  const debug = await fetchBreezyCandidatesDebug({
    dateRangeStart: "2026-05-12",
    dateRangeEnd: "2026-05-20",
  });

  if (!debug.ok) {
    console.error(debug.error);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        total: debug.candidates.length,
        inRange: debug.candidatesInDateRange,
        positions: debug.totalPositions,
        scanned: debug.positionsScanned,
        truncated: debug.truncated,
        skipped: debug.skippedCandidatesReason,
        dateFieldBreakdown: debug.dateFieldBreakdown,
        target: 51,
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
