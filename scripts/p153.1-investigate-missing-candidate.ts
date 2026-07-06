/**
 * P153.1 — Investigate missing new Breezy candidate
 *
 * Usage: npx tsx scripts/p153.1-investigate-missing-candidate.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchBreezyCandidates,
  fetchBreezyCandidatesDebug,
  fetchBreezyJobs,
} from "@/lib/breezy-api";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  isIngestionStoreUsable,
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion/resolve-candidates-for-read";
import { peekBreezyCandidatesCache } from "@/lib/breezy-api";

const SEARCH_EMAIL = "custenborder.taylor@gmail.com";

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

function matchesSearch(c: BreezyCandidate): boolean {
  const name = `${c.firstName ?? ""} ${c.lastName ?? ""} ${c.name ?? ""}`.toLowerCase();
  const email = (c.email ?? "").toLowerCase();
  return (
    name.includes("taylor") ||
    name.includes("custenborder") ||
    email === SEARCH_EMAIL.toLowerCase()
  );
}

function printCandidate(label: string, c: BreezyCandidate): void {
  console.log(
    `  [${label}] id=${c.candidateId} | name=${c.firstName} ${c.lastName} | appliedDate=${c.appliedDate || c.addedDate || "—"} | position=${c.positionName} (${c.positionId}) | stage=${c.stage} | ${c.city}, ${c.state} | email=${c.email}`,
  );
}

function summarizeLayer(name: string, candidates: BreezyCandidate[]): void {
  const hits = candidates.filter(matchesSearch);
  console.log(`\n### ${name}`);
  console.log(`Total candidates in layer: ${candidates.length}`);
  console.log(`Search hits: ${hits.length}`);
  for (const c of hits.sort((a, b) => (b.appliedDate || b.addedDate || "").localeCompare(a.appliedDate || a.addedDate || ""))) {
    printCandidate(name, c);
  }
}

async function main() {
  loadEnvLocal();
  const today = "2026-07-06";
  const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), today };

  console.log("P153.1 — INVESTIGATE MISSING NEW BREEZY CANDIDATE");
  console.log(`Today: ${today}`);
  console.log(`Search: Taylor | Custenborder | ${SEARCH_EMAIL}\n`);

  // --- Live Breezy debug (date range, includes closed) ---
  console.log("=".repeat(80));
  console.log("LAYER A: fetchBreezyCandidatesDebug (live, force=true, includeClosed=true)");
  console.log(`Date range: ${today} to ${today}`);
  const debugToday = await fetchBreezyCandidatesDebug({
    dateRangeStart: today,
    dateRangeEnd: today,
    includeClosed: true,
    includeArchived: true,
    force: true,
  });
  report.debugToday = debugToday.ok
    ? {
        ok: true,
        count: debugToday.candidates.length,
        hits: debugToday.candidates.filter(matchesSearch),
        positionsScanned: debugToday.positionsScanned,
        skipped: debugToday.skippedCandidatesReason,
      }
    : { ok: false, error: debugToday.error };
  if (debugToday.ok) {
    summarizeLayer("Breezy debug TODAY", debugToday.candidates);
    console.log(`Positions scanned: ${debugToday.positionsScanned}`);
    console.log(`Skipped reasons: ${JSON.stringify(debugToday.skippedCandidatesReason)}`);
  } else {
    console.log(`ERROR: ${debugToday.error}`);
  }

  // Wider range last 7 days
  const debugWeek = await fetchBreezyCandidatesDebug({
    dateRangeStart: "2026-06-29",
    dateRangeEnd: today,
    includeClosed: true,
    includeArchived: true,
    force: true,
  });
  report.debugWeek = debugWeek.ok
    ? { ok: true, count: debugWeek.candidates.length, hits: debugWeek.candidates.filter(matchesSearch) }
    : { ok: false, error: debugWeek.error };
  console.log("\n" + "=".repeat(80));
  console.log("LAYER B: fetchBreezyCandidatesDebug (2026-06-29 to today, includeClosed)");
  if (debugWeek.ok) {
    summarizeLayer("Breezy debug WEEK", debugWeek.candidates);
  } else {
    console.log(`ERROR: ${debugWeek.error}`);
  }

  // --- Live scan modes ---
  for (const scanMode of ["preview", "fast", "all"] as const) {
    console.log("\n" + "=".repeat(80));
    console.log(`LAYER C: fetchBreezyCandidates scanMode=${scanMode} force=true`);
    const live = await fetchBreezyCandidates({ scanMode, force: true });
    report[`live_${scanMode}`] = live.ok
      ? {
          ok: true,
          count: live.candidates.length,
          hits: live.candidates.filter(matchesSearch),
          positionsScanned: live.positionsScanned,
          truncated: live.truncated,
          fetchedAt: live.fetchedAt,
          skipped: live.skippedCandidatesReason,
        }
      : { ok: false, error: live.error };
    if (live.ok) {
      summarizeLayer(`Breezy live ${scanMode}`, live.candidates);
      console.log(`positionsScanned=${live.positionsScanned} truncated=${live.truncated} fetchedAt=${live.fetchedAt}`);
      if (live.skippedCandidatesReason) console.log(`skipped: ${JSON.stringify(live.skippedCandidatesReason)}`);
    } else {
      console.log(`ERROR: ${live.error}`);
    }
  }

  // --- Server caches ---
  console.log("\n" + "=".repeat(80));
  console.log("LAYER D: peekBreezyCandidatesCache (in-process, no force)");
  for (const scanMode of ["preview", "fast"] as const) {
    const peek = peekBreezyCandidatesCache({ scanMode });
    if (peek?.ok) {
      summarizeLayer(`server cache ${scanMode}`, peek.candidates);
      console.log(`  cache fetchedAt=${peek.fetchedAt}`);
    } else {
      console.log(`  server cache ${scanMode}: cold`);
    }
  }

  // --- Ingestion store ---
  console.log("\n" + "=".repeat(80));
  console.log("LAYER E: durable ingestion store (candidate-ingestion.json)");
  const store = await readIngestionStore();
  const ingested = listIngestedCandidates(store);
  const usable = isIngestionStoreUsable(store);
  report.ingestionStore = {
    usable,
    candidateCount: ingested.length,
    updatedAt: store.updatedAt,
    lastChunkAt: store.lastChunkAt,
    cycleComplete: store.cycleComplete,
    checkpointIndex: store.checkpointIndex,
    publishedPositionsTotal: store.publishedPositionsTotal,
    scannedPositionIds: store.scannedPositionIds.length,
    hits: ingested.filter(matchesSearch),
  };
  console.log(`isIngestionStoreUsable: ${usable}`);
  console.log(`candidates: ${ingested.length} | updatedAt: ${store.updatedAt} | lastChunkAt: ${store.lastChunkAt}`);
  console.log(`cycleComplete: ${store.cycleComplete} | checkpoint: ${store.checkpointIndex}/${store.publishedPositionsTotal}`);
  console.log(`scanned positions: ${store.scannedPositionIds.length}`);
  summarizeLayer("ingestion store", ingested);

  // --- resolveCandidatesForRead (what P153 used) ---
  console.log("\n" + "=".repeat(80));
  console.log("LAYER F: resolveCandidatesForRead() — platform read path used by P153");
  const resolved = await resolveCandidatesForRead({ scanMode: "fast" });
  report.resolveCandidatesForRead = resolved.ok
    ? {
        ok: true,
        fromIngestionStore: resolved.fromIngestionStore,
        count: resolved.candidates.length,
        hits: resolved.candidates.filter(matchesSearch),
        fetchedAt: resolved.fetchedAt,
      }
    : { ok: false, error: resolved.error };
  if (resolved.ok) {
    console.log(`fromIngestionStore: ${resolved.fromIngestionStore}`);
    console.log(`fetchedAt: ${resolved.fetchedAt}`);
    summarizeLayer("resolveCandidatesForRead", resolved.candidates);
  } else {
    console.log(`ERROR: ${resolved.error}`);
  }

  // --- P153 selection logic replay ---
  console.log("\n" + "=".repeat(80));
  console.log("LAYER G: P153 candidate selection replay");
  if (resolved.ok) {
    const nameMatches = resolved.candidates.filter((c) =>
      (c.name ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`).toLowerCase().includes("taylor custenborder"),
    );
    const selected = nameMatches.sort((a, b) => {
      const da = a.appliedDate || a.addedDate || a.creationDate || a.updatedDate || "";
      const db = b.appliedDate || b.addedDate || b.creationDate || b.updatedDate || "";
      return db.localeCompare(da);
    })[0];
    console.log(`nameMatches (includes 'taylor custenborder'): ${nameMatches.length}`);
    for (const m of nameMatches) {
      printCandidate("nameMatch", m);
    }
    if (selected) {
      console.log(`\nP153 would select: ${selected.candidateId} appliedDate=${selected.appliedDate || selected.addedDate}`);
    }
    report.p153Selection = { nameMatches: nameMatches.map((c) => c.candidateId), selectedId: selected?.candidateId };
  }

  // --- Cross-layer ID union ---
  console.log("\n" + "=".repeat(80));
  console.log("ALL CANDIDATE IDs (union across layers)");
  const allHits = new Map<string, { layers: string[]; candidate: BreezyCandidate }>();
  function collect(layer: string, list: BreezyCandidate[]) {
    for (const c of list.filter(matchesSearch)) {
      const existing = allHits.get(c.candidateId);
      if (existing) existing.layers.push(layer);
      else allHits.set(c.candidateId, { layers: [layer], candidate: c });
    }
  }
  if (debugToday.ok) collect("debugToday", debugToday.candidates);
  if (debugWeek.ok) collect("debugWeek", debugWeek.candidates);
  const liveAll = await fetchBreezyCandidates({ scanMode: "all", force: false });
  if (liveAll.ok) collect("liveAll_cached", liveAll.candidates);
  collect("ingestion", ingested);
  if (resolved.ok) collect("resolveCandidatesForRead", resolved.candidates);

  for (const [id, { layers, candidate }] of [...allHits.entries()].sort((a, b) =>
    (b[1].candidate.appliedDate || "").localeCompare(a[1].candidate.appliedDate || ""),
  )) {
    console.log(`\nID: ${id}`);
    console.log(`  layers: ${layers.join(", ")}`);
    printCandidate("union", candidate);
  }
  report.allIds = [...allHits.keys()];

  // --- Jobs for hit positions ---
  console.log("\n" + "=".repeat(80));
  console.log("POSITION STATUS for search hits");
  const jobs = await fetchBreezyJobs();
  const jobMap = new Map((jobs.ok ? jobs.jobs : []).map((j) => [j.jobId, j]));
  for (const { candidate } of allHits.values()) {
    const job = jobMap.get(candidate.positionId ?? "");
    console.log(
      `positionId=${candidate.positionId} | positionName=${candidate.positionName} | inPublishedJobs=${Boolean(job)} | jobStatus=${job?.status ?? "NOT_IN_PUBLISHED_LIST"}`,
    );
  }

  const jsonPath = path.join(process.cwd(), "artifacts", "p153.1-missing-candidate-investigation.json");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nArtifact: ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
