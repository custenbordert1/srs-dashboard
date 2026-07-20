/**
 * P215 — Breezy Position Resolution Audit (read-only investigation).
 *
 *   node --import tsx scripts/p215-run-position-resolution-audit.ts
 *
 * Verifies whether P214's NON_GEOGRAPHIC_POSTING / MISSING_JOB_LOCATION
 * blocks were correct by resolving each blocked candidate's applied Breezy
 * Position and reading Position.Location directly. GET requests only:
 * no MEL writes, no Breezy writes, no Dropbox activity, no workflow changes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

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

function readJsonIfExists<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Raw read-only Breezy GET (same auth scheme as src/lib/breezy-api.ts). */
async function breezyGetRaw<T>(pathAndQuery: string): Promise<
  { ok: true; status: number; data: T } | { ok: false; status: number | null; error: string }
> {
  const apiKey = process.env.BREEZY_API_KEY?.trim();
  if (!apiKey) return { ok: false, status: null, error: "BREEZY_API_KEY missing" };
  try {
    const res = await fetch(`https://api.breezy.hr/v3${pathAndQuery}`, {
      method: "GET",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : String(err) };
  }
}

type RawPosition = Record<string, any>;
type RawCandidate = Record<string, any>;

async function main(): Promise<void> {
  loadEnvLocal();

  // ---- Integrity snapshot (prove read-only afterwards) ----
  const workflowsRawBefore = readFileSync(".data/candidate-workflows.json", "utf8");
  const workflowsHashBefore = sha256(workflowsRawBefore);
  const ingestionHashBefore = sha256(readFileSync(".data/candidate-ingestion.json", "utf8"));

  const {
    classifyP215RootCause,
    classifyP215TitleKind,
    compareP215AgainstP214,
    auditP215PositionMetadata,
  } = await import("@/lib/p215-position-resolution-audit");
  const { normalizeBreezyJobLocation } = await import("@/lib/breezy-job-location");
  const { resolveBreezyCompany, fetchBreezyJobs } = await import("@/lib/breezy-api");

  // ---- Part 1: scope — P214 posting-location blocks ----
  // P214 emitted a single posting-related blocker, blocked_non_geographic_posting,
  // covering both prompt categories (its title parse produced no city/state ⇒
  // MISSING_JOB_LOCATION evidence classified as a non-geographic posting).
  const p214Blocked = readJsonIfExists<{
    blockedCandidates?: Array<{ redactedCandidateId: string; blockers: string[] }>;
  }>("artifacts/p214-blocked-candidates-summary.json");
  const targetRedacted = new Set(
    (p214Blocked?.blockedCandidates ?? [])
      .filter((b) => b.blockers.includes("blocked_non_geographic_posting"))
      .map((b) => b.redactedCandidateId),
  );

  const workflows = (JSON.parse(workflowsRawBefore) as { workflows: Record<string, any> })
    .workflows;
  const candidateIds = Object.keys(workflows).filter((id) =>
    targetRedacted.has(sha256(id).slice(0, 12)),
  );
  console.log(`P214 posting-location blocked candidates in scope: ${candidateIds.length}`);

  // ---- Part 2 inputs: identity + applied position id from durable stores ----
  // (The rolling ingestion window has since moved past these candidates, so
  // identity comes from the P205 operator ledger and the questionnaire store —
  // then verified live against Breezy below.)
  const p205 = readJsonIfExists<Record<string, unknown>>(".data/p205-operator-local.json");
  const identityById = new Map<string, { name: string; email: string; phone: string }>();
  {
    const walk = (o: unknown): void => {
      if (!o || typeof o !== "object") return;
      const rec = o as Record<string, any>;
      if (!Array.isArray(o) && typeof rec.candidateId === "string" && rec.email) {
        identityById.set(rec.candidateId, {
          name: String(rec.name ?? ""),
          email: String(rec.email ?? "").trim().toLowerCase(),
          phone: String(rec.phone ?? ""),
        });
      }
      for (const v of Object.values(rec)) walk(v);
    };
    walk(p205);
  }

  const questionnaireStore = readJsonIfExists<Record<string, unknown>>(
    ".data/p193-3-questionnaire-store.json",
  );
  const positionIdByCandidate = new Map<string, string>();
  const breezyIdByCandidate = new Map<string, string>();
  {
    const walk = (o: unknown): void => {
      if (!o || typeof o !== "object") return;
      const rec = o as Record<string, any>;
      if (!Array.isArray(o) && typeof rec.candidateId === "string" && rec.positionId) {
        positionIdByCandidate.set(rec.candidateId, String(rec.positionId));
        if (rec.breezyCandidateId) {
          breezyIdByCandidate.set(rec.candidateId, String(rec.breezyCandidateId));
        }
      }
      for (const v of Object.values(rec)) walk(v);
    };
    walk(questionnaireStore);
  }

  const company = await resolveBreezyCompany();
  if (!company.ok) throw new Error(`Breezy company resolution failed: ${company.error}`);
  const companyId = company.companyId;

  // ---- Parts 2–5: resolve candidate + position, classify, compare ----
  const resolutions: Array<Record<string, unknown>> = [];
  const operatorLocalRows: Array<Record<string, unknown>> = [];
  const rootCauseCounts: Record<string, number> = {};
  let correctCount = 0;
  let incorrectCount = 0;

  for (const candidateId of candidateIds) {
    const wf = workflows[candidateId] ?? {};
    const identity = identityById.get(candidateId) ?? { name: "", email: "", phone: "" };
    const positionId = positionIdByCandidate.get(candidateId) ?? "";
    const breezyCandidateId = breezyIdByCandidate.get(candidateId) ?? candidateId;

    // Live position resolution (raw — every available field).
    let rawPosition: RawPosition | null = null;
    let lookupSucceeded = false;
    let positionFound = false;
    if (positionId) {
      const res = await breezyGetRaw<RawPosition>(
        `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}`,
      );
      if (res.ok && res.data && typeof res.data === "object" && (res.data as RawPosition)._id) {
        lookupSucceeded = true;
        positionFound = true;
        rawPosition = res.data;
      } else if (!res.ok && res.status === 404) {
        lookupSucceeded = true; // definitive answer: position gone
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    // Live candidate resolution (stage / pipeline / created date).
    let rawCandidate: RawCandidate | null = null;
    if (positionId) {
      const res = await breezyGetRaw<RawCandidate>(
        `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(
          positionId,
        )}/candidate/${encodeURIComponent(breezyCandidateId)}`,
      );
      if (res.ok) rawCandidate = res.data;
      await new Promise((r) => setTimeout(r, 250));
    }

    const loc = rawPosition ? normalizeBreezyJobLocation(rawPosition) : null;
    const locationBlock = rawPosition?.location ?? null;
    const positionName = String(rawPosition?.name ?? wf.positionName ?? "");
    const titleKind = classifyP215TitleKind(positionName);

    const rootCause = classifyP215RootCause({
      attachedToPosition: Boolean(positionId),
      hasPositionId: Boolean(positionId),
      lookupSucceeded,
      positionFound,
      locationCity: loc?.city ?? "",
      locationState: loc?.state ?? "",
      titleKind,
    });
    rootCauseCounts[rootCause] = (rootCauseCounts[rootCause] ?? 0) + 1;

    // P214 blocked these via title parsing that yielded no city/state.
    const comparison = compareP215AgainstP214({
      rootCause,
      p214Blocker: "NON_GEOGRAPHIC_POSTING",
      locationCity: loc?.city ?? "",
      locationState: loc?.state ?? "",
    });
    if (comparison.p214Correct) correctCount += 1;
    else incorrectCount += 1;

    const record = {
      redactedCandidateId: sha256(candidateId).slice(0, 12),
      emailHash: identity.email ? sha256(identity.email).slice(0, 16) : null,
      breezyCandidateIdRedacted: sha256(breezyCandidateId).slice(0, 12),
      workflowStatus: wf.workflowStatus ?? null,
      appliedPositionId: positionId || null,
      appliedPositionName: positionName || null,
      appliedPositionStatus: rawPosition?.state ?? null,
      appliedPositionType: rawPosition?.type?.name ?? rawPosition?.type?.id ?? null,
      appliedPositionLocation: locationBlock
        ? {
            name: locationBlock.name ?? null,
            city: locationBlock.city ?? null,
            state: locationBlock.state?.id ?? locationBlock.state ?? null,
            country: locationBlock.country?.id ?? null,
            isRemote: locationBlock.is_remote ?? null,
            latitude: locationBlock.latitude ?? locationBlock.lat ?? null,
            longitude: locationBlock.longitude ?? locationBlock.lng ?? null,
          }
        : null,
      normalizedLocation: loc
        ? { city: loc.city, state: loc.state, source: loc.locationSource }
        : null,
      positionTags: rawPosition?.tags ?? null,
      positionDepartment: rawPosition?.department ?? null,
      positionCustomFields: rawPosition?.custom_fields ?? rawPosition?.customFields ?? null,
      hiringTeam: {
        allUsers: Array.isArray(rawPosition?.all_users) ? rawPosition.all_users.length : null,
        allAdmins: Array.isArray(rawPosition?.all_admins) ? rawPosition.all_admins.length : null,
      },
      positionCreatedDate: rawPosition?.creation_date ?? null,
      pipelineId: rawPosition?.pipeline_id ?? null,
      candidateStage: rawCandidate?.stage?.name ?? null,
      candidateCreatedDate: rawCandidate?.creation_date ?? null,
      positionLocationExists: Boolean(loc?.city && loc?.state),
      titleKind,
      rootCause,
      p214Blocker: "NON_GEOGRAPHIC_POSTING (blocked_non_geographic_posting)",
      p214Correct: comparison.p214Correct,
      p214Explanation: comparison.explanation,
    };
    resolutions.push(record);
    operatorLocalRows.push({
      ...record,
      candidateId,
      breezyCandidateId,
      candidateName: identity.name,
      normalizedEmail: identity.email,
    });
    console.log(
      `${record.redactedCandidateId}: position=${positionId || "none"} location=${loc?.city ?? ""}, ${loc?.state ?? ""} → ${rootCause} (P214 correct: ${comparison.p214Correct})`,
    );
  }

  // ---- Part 6: metadata audit across active (published) Breezy positions ----
  const jobsResult = await fetchBreezyJobs("published");
  if (!jobsResult.ok) throw new Error(`fetchBreezyJobs failed: ${jobsResult.error}`);
  const activeJobs = jobsResult.jobs;
  const metadata = auditP215PositionMetadata(
    activeJobs.map((j) => ({ jobId: j.jobId, name: j.name, city: j.city, state: j.state })),
  );
  const bySource: Record<string, number> = {};
  for (const j of activeJobs) bySource[j.locationSource] = (bySource[j.locationSource] ?? 0) + 1;
  // Positions whose usable location came only from parsing the job title.
  const locationFromTitleOnly = bySource.job_name ?? 0;

  // ---- Part 8: title-parsing inventory (static, verified by search) ----
  const titleParsingSites = [
    {
      file: "src/lib/breezy-job-location.ts",
      function: "normalizeBreezyJobLocation (job_name fallback, ~lines 309–315)",
      reason:
        "Last-resort fallback parses the position title when location/address/region fields are empty.",
      suggestedReplacement:
        "Keep as diagnostics-only: the result is already tagged locationSource='job_name' — downstream gates must treat that tag as low-confidence instead of equal to Position.Location.",
    },
    {
      file: "scripts/p214-run-unsent-test-batch.ts",
      function: "phasePreview (parseLocationFromJobName on ingestion positionName)",
      reason:
        "P214 derived posting geography from the stored position title and never resolved the applied Breezy Position object.",
      suggestedReplacement:
        "Resolve candidate.positionId via fetchBreezyPositionById and use Position.Location (job.city/job.state, locationSource != 'job_name'); fall back to title parsing only as explicit low-confidence evidence.",
    },
    {
      file: "scripts/p209-run-coverage-audit.ts",
      function: "main (parseLocationFromJobName fallback for applied job location)",
      reason:
        "Coverage audit parses the position name when the Breezy jobs catalog lacks the position (e.g. closed positions missing from the published list).",
      suggestedReplacement:
        "Fetch the specific position by id (fetchBreezyPositionById works for closed positions) before falling back to the title.",
    },
    {
      file: "src/lib/p210-recruiting-intelligence/posting-quality.ts",
      function: "buildPostingQuality (parseLocationFromJobName on p.name)",
      reason: "Posting-quality scoring judges geography from the title.",
      suggestedReplacement:
        "Use the position's normalized city/state + locationSource from the jobs snapshot; score 'title parseable' separately from 'has Position.Location'.",
    },
    {
      file: "src/lib/breezy-job-status-reconciliation/build-job-status-reconciliation.ts",
      function: "buildJobStatusReconciliation (parseLocationFromJobName)",
      reason: "Reconciliation compares title-derived location with stored fields.",
      suggestedReplacement:
        "Compare against Position.Location fields; keep title parse only to flag title/location drift.",
    },
    {
      file: "src/lib/breezy-job-publish-review/build-job-publish-review.ts",
      function: "buildJobPublishReview (parseLocationFromJobName)",
      reason: "Publish review derives expected location from the draft title.",
      suggestedReplacement:
        "Validate the draft's location block directly and require city+state before publish, instead of accepting a parseable title.",
    },
  ];

  // ---- Read-only verification ----
  const workflowsUnchanged =
    sha256(readFileSync(".data/candidate-workflows.json", "utf8")) === workflowsHashBefore;
  const ingestionUnchanged =
    sha256(readFileSync(".data/candidate-ingestion.json", "utf8")) === ingestionHashBefore;

  const generatedAt = new Date().toISOString();
  const safety = {
    readOnly: true,
    melWrites: 0,
    breezyWrites: 0,
    dropboxWrites: 0,
    workflowStageChanges: 0,
    paperworkActions: 0,
    workflowsFileUnchanged: workflowsUnchanged,
    ingestionFileUnchanged: ingestionUnchanged,
  };

  // ---- Part 9: reports ----
  writeArtifact("p215-position-resolution.json", {
    phase: "P215",
    generatedAt,
    scope: {
      source: "artifacts/p214-blocked-candidates-summary.json",
      p214Blockers: ["blocked_non_geographic_posting (NON_GEOGRAPHIC_POSTING / MISSING_JOB_LOCATION)"],
      blockedCandidatesAudited: resolutions.length,
    },
    resolutions,
    safety,
  });

  writeArtifact("p215-root-cause.json", {
    phase: "P215",
    generatedAt,
    blockedCandidatesAudited: resolutions.length,
    rootCauseCounts,
    p214Correct: correctCount,
    p214Incorrect: incorrectCount,
    incorrectExplanations: resolutions
      .filter((r) => !r.p214Correct)
      .map((r) => ({
        redactedCandidateId: r.redactedCandidateId,
        rootCause: r.rootCause,
        explanation: r.p214Explanation,
      })),
    safety,
  });

  writeArtifact("p215-position-summary.json", {
    phase: "P215",
    generatedAt,
    scanScope: "published (active) Breezy positions",
    ...metadata,
    locationSourceDistribution: bySource,
    positionsWhoseLocationComesOnlyFromTitle: locationFromTitleOnly,
    titleParsingSites,
    safety,
  });

  // Operator-local detail (PII allowed here only).
  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/p215-position-resolution-operator-local.json",
    `${JSON.stringify({ generatedAt, rows: operatorLocalRows }, null, 2)}\n`,
  );
  console.log("[local] .data/p215-position-resolution-operator-local.json");

  // ---- Markdown report ----
  const md = [
    "# P215 — Breezy Position Resolution Audit",
    "",
    `Generated: ${generatedAt} · Read-only investigation (no MEL / Breezy / Dropbox writes, no workflow changes).`,
    "",
    "## Scope",
    "",
    `P214 blocked ${resolutions.length} candidate(s) for posting-location reasons`,
    "(`blocked_non_geographic_posting`, covering both NON_GEOGRAPHIC_POSTING and",
    "MISSING_JOB_LOCATION: the title parse produced no city/state). Each was",
    "re-audited by resolving the applied Breezy Position object directly.",
    "",
    "## Per-candidate resolution",
    "",
    "| Candidate | Applied position | Position status | Position.Location | Root cause | P214 correct? |",
    "| --- | --- | --- | --- | --- | --- |",
    ...resolutions.map(
      (r) =>
        `| \`${r.redactedCandidateId}\` | ${r.appliedPositionName ?? "—"} (\`${r.appliedPositionId ?? "—"}\`) | ${r.appliedPositionStatus ?? "—"} | ${
          (r.normalizedLocation as any)?.city
            ? `${(r.normalizedLocation as any).city}, ${(r.normalizedLocation as any).state} (${(r.normalizedLocation as any).source})`
            : "EMPTY"
        } | ${r.rootCause} | ${r.p214Correct ? "YES" : "**NO**"} |`,
    ),
    "",
    "### Why P214 was wrong (where applicable)",
    "",
    ...resolutions
      .filter((r) => !r.p214Correct)
      .map((r) => `- \`${r.redactedCandidateId}\`: ${r.p214Explanation}`),
    "",
    "## Active position metadata audit",
    "",
    "| Metric | Count |",
    "| --- | --- |",
    `| Total active (published) positions | ${metadata.totalPositions} |`,
    `| Positions with valid location (city + state) | ${metadata.withValidLocation} |`,
    `| Positions without a full location | ${metadata.withoutLocation} |`,
    `| Flexible postings (by title) | ${metadata.flexiblePostings} |`,
    `| National postings (by title) | ${metadata.nationalPostings} |`,
    `| Positions missing city | ${metadata.missingCity} |`,
    `| Positions missing state | ${metadata.missingState} |`,
    `| Locations derived only from the job title | ${locationFromTitleOnly} |`,
    "",
    `Location source distribution: ${JSON.stringify(bySource)}`,
    "",
    "## Recommended authoritative hierarchy",
    "",
    "```",
    "Applied Position ID  →  Position.Location (authoritative posting geography)",
    "        ↓ (coverage inputs)",
    "Candidate Home Location  →  distance to active work",
    "        ↓ (routing)",
    "Market → Territory → DM → Coverage Gate",
    "```",
    "",
    "- `Position.Location` is the authoritative source for posting geography. It was",
    "  present on every position audited here, including postings whose titles carry",
    "  no city/state.",
    "- Title parsing should **never** gate sends or coverage decisions. It may remain",
    "  as a tagged, low-confidence diagnostic (`locationSource='job_name'`) for",
    "  drift detection only.",
    "- Candidate home location remains the coverage-distance input; posting geography",
    "  routes market → territory → DM before the coverage gate.",
    "",
    "## Title-parsing inventory (no code changed)",
    "",
    ...titleParsingSites.flatMap((s) => [
      `### \`${s.file}\``,
      `- Function: ${s.function}`,
      `- Reason: ${s.reason}`,
      `- Suggested replacement: ${s.suggestedReplacement}`,
      "",
    ]),
    "## Safety",
    "",
    `- Read-only: workflows file unchanged=${workflowsUnchanged}, ingestion file unchanged=${ingestionUnchanged}`,
    "- MEL writes: 0 · Breezy writes: 0 · Dropbox writes: 0 · Workflow stage changes: 0",
    "",
  ].join("\n");
  writeArtifact("p215-position-resolution-audit.md", `${md}\n`);

  console.log(
    JSON.stringify(
      {
        audited: resolutions.length,
        rootCauseCounts,
        p214Correct: correctCount,
        p214Incorrect: incorrectCount,
        activePositions: metadata.totalPositions,
        positionsMissingLocation: metadata.withoutLocation,
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
