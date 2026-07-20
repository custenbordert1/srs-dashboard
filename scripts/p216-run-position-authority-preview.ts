/**
 * P216 — Position.Location Authority & P214 Revalidation (preview only).
 *
 *   node --import tsx scripts/p216-run-position-authority-preview.ts
 *
 * 1. Confirms Position.Location authority for the two P215 candidates
 * 2. Re-runs the full P214 eligibility pipeline with --no-freeze
 * 3. Writes P216 comparison / authority artifacts
 *
 * Never freezes a cohort, never sends paperwork, never writes MEL/Breezy/
 * Dropbox, never moves workflow stages.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function loadEnvLocal(): void {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function writeArtifact(name: string, data: unknown): void {
  mkdirSync("artifacts", { recursive: true });
  const file = path.join("artifacts", name);
  writeFileSync(file, typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[artifact] ${file}`);
}

/** The two P215 candidates incorrectly blocked for non-geographic posting. */
const P215_TARGETS = [
  {
    candidateId: "0f25dd13d4ed",
    expectedCity: "Columbus",
    expectedState: "OH",
    expectedDm: "Mindie Rodriguez",
    positionId: "73048dbe5519",
  },
  {
    candidateId: "bc2111302660",
    expectedCity: "Kansas City",
    expectedState: "MO",
    expectedDm: "Amy Harp",
    positionId: "f2ca3cdaeee8",
  },
] as const;

async function main(): Promise<void> {
  loadEnvLocal();

  const workflowsHashBefore = sha256(readFileSync(".data/candidate-workflows.json", "utf8"));
  const ingestionHashBefore = sha256(readFileSync(".data/candidate-ingestion.json", "utf8"));
  const cohortBefore = existsSync(".data/p214-frozen-cohort-local.json")
    ? sha256(readFileSync(".data/p214-frozen-cohort-local.json", "utf8"))
    : null;

  // Snapshot prior P214 blocked state for comparison.
  const priorBlocked = existsSync("artifacts/p214-blocked-candidates-summary.json")
    ? JSON.parse(readFileSync("artifacts/p214-blocked-candidates-summary.json", "utf8"))
    : { blockedCandidates: [] };

  const {
    resolveP216Routing,
    hasAuthoritativeGeoPosting,
    expectedDmForCityState,
    P216_TITLE_PARSING_INVENTORY,
    remainingTitleParsingForGeography,
    countAuthoritativeJobs,
  } = await import("@/lib/p216-position-location-authority");
  const { getDmForState } = await import("@/lib/dm-territory-map");
  const { fetchBreezyPositionById, fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { evaluateP214Gates, p214TierForMiles } = await import("@/lib/p214-unsent-test-batch");
  const { normalizeZip5 } = await import("@/lib/p200-territory-intelligence/zip-centroids");
  const { geocodeKey, getCachedGeocode, setCachedGeocode } = await import(
    "@/lib/geocoding/geocode-cache"
  );
  const { haversineMiles, estimateGeoPoint } = await import("@/lib/mel-matching/distance-utils");
  const { fetchMelProjectsSheet } = await import("@/lib/mel-projects-sheet");
  const { extractActiveOpportunities } = await import("@/lib/p209-coverage-audit/opportunities");

  // Identity / home enrichment (same durable stores as P214/P215).
  const enrichById = new Map<
    string,
    { name?: string; email?: string; city?: string; state?: string; zip?: string; positionId?: string }
  >();
  function walk(o: unknown, fn: (rec: Record<string, any>) => void) {
    if (!o || typeof o !== "object") return;
    const rec = o as Record<string, any>;
    if (!Array.isArray(o) && typeof rec.candidateId === "string") fn(rec);
    for (const v of Object.values(rec)) walk(v, fn);
  }
  for (const file of [
    ".data/p205-operator-local.json",
    ".data/p204-1-supervised-pilot-operator-local.json",
    ".data/p193-3-questionnaire-store.json",
    ".data/p200-2-zip-capture-store.json",
  ]) {
    if (!existsSync(file)) continue;
    try {
      walk(JSON.parse(readFileSync(file, "utf8")), (rec) => {
        const cur = enrichById.get(rec.candidateId) ?? {};
        enrichById.set(rec.candidateId, {
          name: cur.name || (typeof rec.name === "string" ? rec.name : undefined),
          email: cur.email || (typeof rec.email === "string" ? rec.email : undefined),
          city: cur.city || (typeof rec.city === "string" ? rec.city : undefined),
          state: cur.state || (typeof rec.state === "string" ? rec.state : undefined),
          zip:
            cur.zip ||
            (typeof rec.zipCode === "string"
              ? rec.zipCode
              : typeof rec.zip === "string"
                ? rec.zip
                : undefined),
          positionId:
            cur.positionId || (typeof rec.positionId === "string" ? rec.positionId : undefined),
        });
      });
    } catch {
      /* ignore */
    }
  }

  const workflows = JSON.parse(readFileSync(".data/candidate-workflows.json", "utf8")).workflows as Record<
    string,
    any
  >;

  // MEL opportunities for coverage recalculation.
  const sheet = await fetchMelProjectsSheet();
  const opportunities = extractActiveOpportunities(sheet.rows as Array<Record<string, string>>);

  type Point = { lat: number; lng: number };
  async function nominatimFetch(query: string): Promise<Point | null> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "us");
    try {
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "SRS-Recruiting-Dashboard/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as Array<{ lat?: string; lon?: string }>;
      const lat = Number.parseFloat(body[0]?.lat ?? "");
      const lng = Number.parseFloat(body[0]?.lon ?? "");
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
      return null;
    }
  }
  async function trustedPoint(
    parts: { city?: string; state?: string; zip?: string },
    allowNetwork: boolean,
  ): Promise<Point | null> {
    const zip5 = normalizeZip5(parts.zip ?? null) ?? undefined;
    const key = geocodeKey({ city: parts.city, state: parts.state, zip: zip5 });
    const cached = await getCachedGeocode(key);
    if (cached && cached.source === "nominatim") return { lat: cached.lat, lng: cached.lng };
    if (!allowNetwork) return null;
    const query = [parts.city, parts.state, zip5, "USA"].filter(Boolean).join(", ");
    const hit = await nominatimFetch(query);
    if (hit) {
      await setCachedGeocode(key, { ...hit, source: "nominatim" });
    }
    return hit;
  }

  const oppLocations = new Map<string, { city: string; state: string }>();
  for (const o of opportunities) {
    const city = String(o.city ?? "").trim();
    const state = String(o.state ?? "").trim().toUpperCase();
    if (!city || !state) continue;
    oppLocations.set(`${city}|${state}`.toLowerCase(), { city, state });
  }
  const trustedOppPoints = new Map<string, Point>();
  for (const [key, loc] of oppLocations) {
    const p = await trustedPoint(loc, false);
    if (p) trustedOppPoints.set(key, p);
  }

  async function nearestTrustedWork(candPoint: Point, candState: string) {
    let best: { miles: number; city: string; state: string } | null = null;
    for (const [key, loc] of oppLocations) {
      const p = trustedOppPoints.get(key);
      if (!p) continue;
      const mi = haversineMiles(candPoint, p);
      if (!best || mi < best.miles) best = { miles: mi, city: loc.city, state: loc.state };
    }
    let lookups = 0;
    for (const [key, loc] of oppLocations) {
      if (trustedOppPoints.has(key)) continue;
      const sameState = loc.state === candState;
      if (!sameState) {
        const coarse = estimateGeoPoint(loc.city, loc.state);
        if (!coarse || haversineMiles(candPoint, coarse) > 200) continue;
      }
      if (lookups >= 8) break;
      const p = await trustedPoint(loc, true);
      lookups += 1;
      if (!p) continue;
      trustedOppPoints.set(key, p);
      const mi = haversineMiles(candPoint, p);
      if (!best || mi < best.miles) best = { miles: mi, city: loc.city, state: loc.state };
    }
    return best;
  }

  // ---- Parts 3–6: resolve the two P215 candidates ----
  const locationResolutions: Array<Record<string, unknown>> = [];
  const candidateComparisons: Array<Record<string, unknown>> = [];
  let correctlyResolved = 0;
  let stillBlocked = 0;
  let nowEligible = 0;

  for (const target of P215_TARGETS) {
    const enrich = enrichById.get(target.candidateId) ?? {};
    const wf = workflows[target.candidateId] ?? {};
    const positionId = enrich.positionId || target.positionId;
    const live = await fetchBreezyPositionById(positionId);
    const job = live.ok && "found" in live && live.found ? live.job : null;

    const homeCity = String(enrich.city ?? "").trim();
    const homeState = String(enrich.state ?? "").trim().toUpperCase();
    const homeZip = normalizeZip5(enrich.zip ?? null) ?? "";

    const routing = resolveP216Routing(
      {
        positionId,
        positionName: job?.name ?? null,
        positionStatus: job?.status ?? null,
        city: job?.city ?? "",
        state: job?.state ?? "",
        zip: job?.zip ?? "",
        displayLocation: job?.displayLocation ?? "",
        locationSource: job?.locationSource ?? "missing",
        homeCity,
        homeState,
      },
      (s) => getDmForState(s),
    );

    const dmResolvedCorrectly =
      routing.posting.authoritative &&
      routing.posting.city.toLowerCase() === target.expectedCity.toLowerCase() &&
      routing.posting.state === target.expectedState &&
      routing.expectedDm === target.expectedDm &&
      expectedDmForCityState(routing.posting.city, routing.posting.state) === target.expectedDm;

    if (dmResolvedCorrectly) correctlyResolved += 1;

    const candidatePoint =
      homeZip || (homeCity && homeState)
        ? await trustedPoint({ city: homeCity, state: homeState, zip: homeZip }, true)
        : null;
    let nearest: { miles: number; city: string; state: string } | null = null;
    let coverageKnown = Boolean(candidatePoint);
    if (candidatePoint) {
      nearest = await nearestTrustedWork(candidatePoint, homeState);
      if (!nearest) coverageKnown = false;
    }

    const assignedDm = String(wf.assignedDM ?? "").trim();
    const jobCity = routing.posting.authoritative ? routing.posting.city : "";
    const jobState = routing.posting.authoritative ? routing.posting.state : "";
    const miles = nearest && coverageKnown ? Math.round(nearest.miles * 10) / 10 : null;
    const gates = evaluateP214Gates({
      nearestActiveWorkMiles: miles,
      hasActiveOpportunities: opportunities.length > 0,
      coverageKnown,
      assignedDm,
      expectedDm: routing.expectedDm,
      jobCity,
      jobState,
    });
    const tier = p214TierForMiles(miles);

    if (gates.eligible) nowEligible += 1;
    else stillBlocked += 1;

    const prior = (priorBlocked.blockedCandidates ?? []).find(
      (b: any) => b.redactedCandidateId === sha256(target.candidateId).slice(0, 12),
    );

    const row = {
      redactedCandidateId: sha256(target.candidateId).slice(0, 12),
      emailHash: enrich.email ? sha256(enrich.email.toLowerCase()).slice(0, 16) : null,
      position: job?.name ?? null,
      positionId,
      positionStatus: job?.status ?? null,
      positionLocation: routing.posting.authoritative
        ? {
            city: routing.posting.city,
            state: routing.posting.state,
            source: routing.posting.locationSource,
          }
        : null,
      positionLocationAuthoritative: routing.posting.authoritative,
      hasAuthoritativeGeoPosting: hasAuthoritativeGeoPosting(routing.posting),
      nearestWork: nearest ? `${nearest.city}, ${nearest.state}` : null,
      distanceMiles: miles,
      coverageTier: tier,
      market: routing.routingState || null,
      territory: routing.routingState || null,
      assignedDm: assignedDm || "Unassigned",
      expectedDm: routing.expectedDm,
      dmResolvedCorrectly,
      eligibility: gates.eligible ? "ELIGIBLE" : "BLOCKED",
      blockers: gates.blockers,
      remainingGate: gates.eligible ? null : gates.blockers.join(", "),
      reason: gates.eligible
        ? "All P214 gates passed under Position.Location authority"
        : `Still blocked: ${gates.blockers.join(", ")}`,
      p214Before: prior
        ? {
            blockers: prior.blockers,
            geoPosting: prior.geoPosting,
            expectedDm: prior.expectedDm,
            nearestActiveWorkMiles: prior.nearestActiveWorkMiles,
          }
        : null,
    };

    locationResolutions.push({
      redactedCandidateId: row.redactedCandidateId,
      appliedPositionId: positionId,
      positionName: job?.name ?? null,
      locationSource: routing.posting.locationSource,
      authoritative: routing.posting.authoritative,
      city: routing.posting.city,
      state: routing.posting.state,
      expectedDm: routing.expectedDm,
      dmResolvedCorrectly,
    });
    candidateComparisons.push(row);

    console.log(
      `${row.redactedCandidateId}: ${routing.posting.city}, ${routing.posting.state} → DM ${routing.expectedDm} (correct=${dmResolvedCorrectly}) | ${row.eligibility} ${row.remainingGate ?? ""}`,
    );
  }

  // ---- Part 5: full P214 eligibility pipeline, preview, no freeze ----
  console.log("\n=== Running P214 eligibility pipeline (--no-freeze) ===");
  const p214 = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/p214-run-unsent-test-batch.ts", "--phase", "preview", "--no-freeze"],
    {
      cwd: process.cwd(),
      env: { ...process.env, P214_PREVIEW_NO_FREEZE: "1" },
      encoding: "utf8",
      timeout: 600_000,
    },
  );
  if (p214.status !== 0) {
    console.error(p214.stdout);
    console.error(p214.stderr);
    throw new Error(`P214 --no-freeze preview failed with status ${p214.status}`);
  }
  console.log(p214.stdout.split("\n").slice(-30).join("\n"));

  const freshPreview = JSON.parse(readFileSync("artifacts/p214-unsent-test-preview.json", "utf8"));
  const freshBlocked = JSON.parse(
    readFileSync("artifacts/p214-blocked-candidates-summary.json", "utf8"),
  );

  // Active positions metadata (authority check).
  const jobsResult = await fetchBreezyJobs("published");
  if (!jobsResult.ok) throw new Error(`fetchBreezyJobs failed: ${jobsResult.error}`);
  const authStats = countAuthoritativeJobs(jobsResult.jobs);

  // Code audit: live grep for remaining title-driven geography.
  const grep = spawnSync(
    "rg",
    [
      "-n",
      "parseLocationFromJobName",
      "scripts/p209-run-coverage-audit.ts",
      "scripts/p214-run-unsent-test-batch.ts",
      "src/lib/p210-recruiting-intelligence/posting-quality.ts",
      "src/lib/breezy-job-status-reconciliation",
      "src/lib/breezy-job-publish-review",
      "src/lib/p211-market-action",
      "src/lib/p212",
      "src/lib/p213",
    ],
    { encoding: "utf8" },
  );
  const remainingProductionTitleParses = (grep.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const workflowsUnchanged =
    sha256(readFileSync(".data/candidate-workflows.json", "utf8")) === workflowsHashBefore;
  const ingestionUnchanged =
    sha256(readFileSync(".data/candidate-ingestion.json", "utf8")) === ingestionHashBefore;
  const cohortUnchanged =
    cohortBefore == null
      ? true
      : sha256(readFileSync(".data/p214-frozen-cohort-local.json", "utf8")) === cohortBefore;

  const generatedAt = new Date().toISOString();
  const safety = {
    previewOnly: true,
    paperworkSent: 0,
    dropboxWrites: 0,
    melWrites: 0,
    breezyWrites: 0,
    workflowStageChanges: 0,
    cohortFrozen: false,
    workflowsFileUnchanged: workflowsUnchanged,
    ingestionFileUnchanged: ingestionUnchanged,
    frozenCohortFileUnchanged: cohortUnchanged,
  };

  const futureBatchWouldContainCandidates =
    (freshPreview.eligibleAndUnsent ?? 0) > 0 && (freshPreview.proposedTestCohortSize ?? 0) > 0;

  writeArtifact("p216-location-resolution.json", {
    phase: "P216",
    generatedAt,
    hierarchy: [
      "Candidate Applied Position ID",
      "Breezy Position.Location",
      "Candidate Home Location",
      "Market",
      "Territory",
      "DM",
      "Coverage Gate",
    ],
    titleParsingPolicy: "diagnostic_only (locationSource=job_name); never for gates",
    resolutions: locationResolutions,
    activePositionAuthority: authStats,
    safety,
  });

  writeArtifact("p216-candidate-comparison.json", {
    phase: "P216",
    generatedAt,
    previouslyBlockedByNonGeographicPosting: P215_TARGETS.length,
    correctlyResolvedPositionAndDm: correctlyResolved,
    stillBlocked,
    nowEligible,
    candidates: candidateComparisons,
    safety,
  });

  writeArtifact("p216-preview-results.json", {
    phase: "P216",
    generatedAt,
    p214PreviewMode: "no-freeze",
    p214Eligibility: {
      totalApplicantsReviewed: freshPreview.totalApplicantsReviewed,
      eligibleAndUnsent: freshPreview.eligibleAndUnsent,
      proposedTestCohortSize: freshPreview.proposedTestCohortSize,
      blockedByNonGeographicPosting: freshPreview.blockedByNonGeographicPosting,
      blockedByDmAssignment: freshPreview.blockedByDmAssignment,
      blockedByCoverage: freshPreview.blockedByCoverage,
      classificationCounts: freshPreview.classificationCounts,
    },
    freshBlockedByReason: freshBlocked.blockedByReason,
    futureP214TestBatchWouldContainCandidates: futureBatchWouldContainCandidates,
    bothP215CandidatesNowEligible: nowEligible === P215_TARGETS.length,
    safety,
  });

  const md = [
    "# P216 — Position.Location Authority & P214 Revalidation",
    "",
    `Generated: ${generatedAt} · Preview only (no freeze, no send, no workflow writes).`,
    "",
    "## Authority hierarchy",
    "",
    "1. Candidate Applied Position ID",
    "2. Breezy Position.Location *(authoritative posting geography)*",
    "3. Candidate Home Location *(coverage distance input)*",
    "4. Market → Territory → DM → Coverage Gate",
    "",
    "Title parsing is retained only as `locationSource=\"job_name\"` (diagnostic).",
    "It no longer populates city/state and never drives coverage, DM, distance, or eligibility.",
    "",
    "## P215 candidate revalidation",
    "",
    "| Candidate | Position.Location | Expected DM | DM correct? | Nearest work | Miles | Tier | Eligibility | Remaining gate |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...candidateComparisons.map(
      (c) =>
        `| \`${c.redactedCandidateId}\` | ${
          (c.positionLocation as any)
            ? `${(c.positionLocation as any).city}, ${(c.positionLocation as any).state}`
            : "EMPTY"
        } | ${c.expectedDm} | ${c.dmResolvedCorrectly ? "YES" : "NO"} | ${c.nearestWork ?? "—"} | ${c.distanceMiles ?? "—"} | ${c.coverageTier} | ${c.eligibility} | ${c.remainingGate ?? "—"} |`,
    ),
    "",
    "### Before → After (non-geographic gate)",
    "",
    ...candidateComparisons.map((c) => {
      const before = (c.p214Before as any)?.blockers ?? [];
      const after = c.blockers as string[];
      return `- \`${c.redactedCandidateId}\`: before=[${before.join(", ")}] → after=[${after.join(", ") || "none"}]`;
    }),
    "",
    "## P214 eligibility re-run (--no-freeze)",
    "",
    `| Metric | Count |`,
    `| --- | --- |`,
    `| Applicants reviewed | ${freshPreview.totalApplicantsReviewed} |`,
    `| Eligible and unsent | ${freshPreview.eligibleAndUnsent} |`,
    `| Would-be cohort size (not frozen) | ${freshPreview.proposedTestCohortSize} |`,
    `| Blocked by non-geographic posting | ${freshPreview.blockedByNonGeographicPosting} |`,
    `| Blocked by DM assignment | ${freshPreview.blockedByDmAssignment} |`,
    `| Blocked by coverage | ${freshPreview.blockedByCoverage} |`,
    `| Future P214 test batch would contain candidates | ${futureBatchWouldContainCandidates ? "YES" : "NO"} |`,
    `| Both P215 candidates now eligible | ${nowEligible === P215_TARGETS.length ? "YES" : "NO"} |`,
    "",
    "## Active position authority",
    "",
    `- Total published positions: ${authStats.total}`,
    `- Authoritative Position.Location: ${authStats.authoritative}`,
    `- Title-only (diagnostic): ${authStats.titleOnly}`,
    `- Missing location: ${authStats.missing}`,
    `- Position.Location resolution success rate: ${
      authStats.total ? Math.round((authStats.authoritative / authStats.total) * 1000) / 10 : 0
    }%`,
    "",
    "## Title-parsing inventory",
    "",
    ...P216_TITLE_PARSING_INVENTORY.map(
      (s) => `- \`${s.file}\` · ${s.function} · **${s.role}** — ${s.notes}`,
    ),
    "",
    remainingProductionTitleParses.length === 0
      ? "Live grep of P209–P214 production paths: **no remaining `parseLocationFromJobName` call sites**."
      : `Live grep remaining call sites:\n${remainingProductionTitleParses.map((l) => `  - ${l}`).join("\n")}`,
    "",
    `Inventory entries still marked must_not_drive_geography: ${remainingTitleParsingForGeography().length}`,
    "",
    "## Safety",
    "",
    `- Preview only · paperwork sent: 0 · Dropbox/MEL/Breezy writes: 0 · workflow stage changes: 0`,
    `- workflows unchanged=${workflowsUnchanged} · ingestion unchanged=${ingestionUnchanged} · frozen cohort unchanged=${cohortUnchanged}`,
    "",
  ].join("\n");

  writeArtifact("p216-position-authority-report.md", `${md}\n`);

  writeFileSync(
    ".data/p216-position-authority-operator-local.json",
    `${JSON.stringify(
      {
        generatedAt,
        targets: P215_TARGETS.map((t) => ({
          ...t,
          enrich: enrichById.get(t.candidateId) ?? null,
        })),
        comparisons: candidateComparisons,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        candidatesReEvaluated: P215_TARGETS.length,
        correctlyResolved,
        stillBlocked,
        nowEligible,
        bothEligible: nowEligible === P215_TARGETS.length,
        futureBatchWouldContainCandidates,
        positionLocationSuccessRate:
          authStats.total > 0
            ? Math.round((authStats.authoritative / authStats.total) * 1000) / 10
            : 0,
        remainingTitleParses: remainingProductionTitleParses.length,
        safety,
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
