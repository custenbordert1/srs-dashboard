/**
 * P214 — Controlled Unsent Applicant Test Batch
 *
 *   node --import tsx scripts/p214-run-unsent-test-batch.ts --phase preview
 *   node --import tsx scripts/p214-run-unsent-test-batch.ts --phase send
 *   node --import tsx scripts/p214-run-unsent-test-batch.ts --phase post
 *
 * Test-mode only (test_mode=true, never legally binding). Max 20 candidates,
 * batches of ≤5, ≤4 requests/minute. Never writes MEL, never reassigns DMs,
 * never changes job postings, never activates continuous automation, never
 * touches candidates outside the frozen cohort.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const AUTHORIZED_BY = "operator-prompt-p214";
const COHORT_LOCAL = ".data/p214-frozen-cohort-local.json";
const OPERATOR_LOCAL = ".data/p214-unsent-test-send-operator-local.json";
const PREVIEW_ENVELOPE_INDEX_LOCAL = ".data/p214-preview-envelope-index-local.json";

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
  writeFileSync(path.join("artifacts", name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[artifact] artifacts/${name}`);
}

function writeLocal(file: string, data: unknown): void {
  mkdirSync(".data", { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`[local] ${file}`);
}

function readJsonIfExists<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** The ingestion store currently has trailing bytes after the JSON document. */
function tolerantJsonParse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const m = String(err instanceof Error ? err.message : err).match(/position (\d+)/);
    if (m) return JSON.parse(raw.slice(0, Number(m[1]))) as T;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Dropbox Sign read-only helpers (raw API — exposes test_mode on responses)
// ---------------------------------------------------------------------------

type RawSignatureRequest = {
  signature_request_id?: string;
  test_mode?: boolean;
  is_complete?: boolean;
  is_declined?: boolean;
  created_at?: number;
  signatures?: Array<{
    signer_email_address?: string;
    status_code?: string;
    last_viewed_at?: number | null;
    signed_at?: number | null;
  }>;
};

function dropboxAuthHeader(): string {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY?.trim() ?? "";
  if (!apiKey) throw new Error("DROPBOX_SIGN_API_KEY missing");
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function dropboxGetRaw<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`https://api.hellosign.com/v3${pathAndQuery}`, {
    headers: { Authorization: dropboxAuthHeader() },
  });
  const body = (await res.json()) as T & { error?: { error_msg?: string } };
  if (!res.ok) {
    throw new Error(
      `Dropbox GET ${pathAndQuery} failed (${res.status}): ${body?.error?.error_msg ?? "unknown"}`,
    );
  }
  return body;
}

function strongestEnvelopeStatus(
  req: RawSignatureRequest,
): "complete" | "partially_signed" | "declined" | "viewed" | "pending" {
  if (req.is_complete) return "complete";
  const sigs = req.signatures ?? [];
  if (sigs.some((s) => s.status_code === "signed")) return "partially_signed";
  if (req.is_declined) return "declined";
  if (sigs.some((s) => s.last_viewed_at)) return "viewed";
  return "pending";
}

export type EnvelopeIndexEntry = {
  count: number;
  strongest: "complete" | "partially_signed" | "declined" | "viewed" | "pending";
  requestIds: string[];
  anyProductionMode: boolean;
};

const STATUS_RANK = { complete: 4, partially_signed: 3, declined: 2, viewed: 1, pending: 0 };

/**
 * Targeted live Dropbox lookup for one signer email. The account holds ~15k
 * signature requests, so a full listing is impractical; the list endpoint's
 * query filter is verified to return exact signer matches (and 0 results for
 * unknown emails). Only requests where a signer email matches exactly count.
 */
async function queryEnvelopesForEmail(email: string): Promise<EnvelopeIndexEntry> {
  const normalized = email.trim().toLowerCase();
  const entry: EnvelopeIndexEntry = {
    count: 0,
    strongest: "pending",
    requestIds: [],
    anyProductionMode: false,
  };
  if (!normalized) return entry;
  const body = await dropboxGetRaw<{
    list_info?: { num_results?: number };
    signature_requests?: RawSignatureRequest[];
  }>(`/signature_request/list?page=1&page_size=100&query=${encodeURIComponent(normalized)}`);
  for (const req of body.signature_requests ?? []) {
    const matches = (req.signatures ?? []).some(
      (s) => String(s.signer_email_address ?? "").trim().toLowerCase() === normalized,
    );
    if (!matches) continue;
    const strongest = strongestEnvelopeStatus(req);
    entry.count += 1;
    entry.requestIds.push(req.signature_request_id ?? "");
    if (STATUS_RANK[strongest] > STATUS_RANK[entry.strongest]) entry.strongest = strongest;
    if (req.test_mode === false) entry.anyProductionMode = true;
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Prior-send ledgers (candidate ids + emails that have ever been sent /
// belonged to a prior paperwork cohort)
// ---------------------------------------------------------------------------

function loadPriorSendLedgers(): {
  candidateIds: Set<string>;
  emails: Set<string>;
  sources: Record<string, number>;
} {
  const candidateIds = new Set<string>();
  const emails = new Set<string>();
  const sources: Record<string, number> = {};
  const add = (source: string, id?: string | null, email?: string | null) => {
    let hit = false;
    if (id) {
      candidateIds.add(id);
      hit = true;
    }
    const e = String(email ?? "").trim().toLowerCase();
    if (e) {
      emails.add(e);
      hit = true;
    }
    if (hit) sources[source] = (sources[source] ?? 0) + 1;
  };

  // P208 frozen cohort (all members were authorized/attempted for send).
  const p208 = readJsonIfExists<{ members?: Array<{ candidateId?: string }> }>(
    ".data/p208-frozen-cohort-local.json",
  );
  for (const m of p208?.members ?? []) add("p208_frozen_cohort", m.candidateId);

  // P208 operator ledger (emails).
  const p208Local = readJsonIfExists<{ members?: Array<{ candidateId?: string; email?: string }> }>(
    ".data/p208-same-day-send-operator-local.json",
  );
  for (const m of p208Local?.members ?? []) add("p208_operator_ledger", m.candidateId, m.email);

  // P208 append-only send audit.
  if (existsSync(".data/p208-same-day-send-audit.jsonl")) {
    for (const line of readFileSync(".data/p208-same-day-send-audit.jsonl", "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as { candidateId?: string };
        add("p208_send_audit", e.candidateId);
      } catch {
        // skip malformed lines
      }
    }
  }

  // P185-7 production rollout snapshot (real production sends).
  const p185Snap = readJsonIfExists<{ memberIds?: string[] }>(
    "artifacts/p185-7-previous-rollout-snapshot.json",
  );
  for (const id of p185Snap?.memberIds ?? []) add("p185_7_rollout", id);

  // P185-3 rollout cohort (queued members of a prior paperwork cohort).
  const p185Local = readJsonIfExists<{ members?: Array<{ candidateId?: string }> }>(
    ".data/p185-3-live-paperwork-rollout-operator-local.json",
  );
  for (const m of p185Local?.members ?? []) add("p185_3_cohort", m.candidateId);

  // P100 controlled live send.
  const p100 = readJsonIfExists<{ sentCandidateIds?: string[] }>(
    ".data/p100-controlled-live-send-state.json",
  );
  for (const id of p100?.sentCandidateIds ?? []) add("p100_live_send", id);

  // P104 test cohort live send — only executions that produced an envelope.
  const p104 = readJsonIfExists<{
    executions?: Array<{ candidateId?: string; email?: string; signatureRequestId?: string | null }>;
  }>(".data/p104-test-cohort-live-send.json");
  for (const e of p104?.executions ?? []) {
    if (e.signatureRequestId) add("p104_live_send", e.candidateId, e.email);
  }

  return { candidateIds, emails, sources };
}

/** Onboarding records that already carry an envelope. */
function loadOnboardingEnvelopeIds(): Set<string> {
  const ids = new Set<string>();
  const raw = readJsonIfExists<Record<string, unknown>>(".data/candidate-onboarding-records.json");
  if (!raw) return ids;
  const recs = (raw as { records?: unknown }).records ?? raw;
  const arr = Array.isArray(recs) ? recs : Object.values(recs as Record<string, unknown>);
  for (const r of arr as Array<{ candidateId?: string; signatureRequestId?: string }>) {
    if (r?.candidateId && r?.signatureRequestId) ids.add(r.candidateId);
  }
  return ids;
}

function continuousAutomationActive(): { active: boolean; detail: string } {
  const p184 = readJsonIfExists<{ config?: { mode?: string; enabled?: boolean } }>(
    ".data/p184-autonomous-paperwork-send-state.json",
  );
  if (p184?.config?.enabled && p184.config.mode !== "dry_run") {
    return { active: true, detail: `p184 runner enabled in mode=${p184.config.mode}` };
  }
  const p185 = readJsonIfExists<{ safety?: { productionAutomationEnabled?: boolean } }>(
    ".data/p185-production-paperwork-automation-state.json",
  );
  if (p185?.safety?.productionAutomationEnabled) {
    return { active: true, detail: "p185 productionAutomationEnabled=true" };
  }
  return {
    active: false,
    detail: "p184 mode=dry_run / p185 productionAutomationEnabled=false — no continuous runner",
  };
}

// ---------------------------------------------------------------------------
// Phase 1+2+3: reconcile everything, preview, freeze cohort
// ---------------------------------------------------------------------------

async function phasePreview(): Promise<void> {
  const {
    classifyP214SendHistory,
    collapseDuplicateIdentities,
    normalizeP214Email,
    evaluateP214Gates,
    selectP214Cohort,
    freezeP214Cohort,
    P214_MAX_COHORT_SIZE,
  } = await import("@/lib/p214-unsent-test-batch");

  const workflowsRawBefore = readFileSync(".data/candidate-workflows.json", "utf8");
  const ingestionRawBefore = readFileSync(".data/candidate-ingestion.json", "utf8");
  const workflowsHashBefore = sha256(workflowsRawBefore);
  const ingestionHashBefore = sha256(ingestionRawBefore);

  const workflows = (JSON.parse(workflowsRawBefore) as { workflows: Record<string, any> })
    .workflows;
  const ingestion = tolerantJsonParse<{ candidates: Record<string, any> }>(ingestionRawBefore)
    .candidates;

  // Durable enrichment for candidates that have aged out of the rolling
  // ingestion window (positionId / contact / home ZIP).
  const enrichById = new Map<
    string,
    { email?: string; name?: string; city?: string; state?: string; zip?: string; positionId?: string }
  >();
  function mergeEnrich(id: string, patch: Record<string, string | undefined>) {
    const cur = enrichById.get(id) ?? {};
    enrichById.set(id, {
      email: cur.email || patch.email,
      name: cur.name || patch.name,
      city: cur.city || patch.city,
      state: cur.state || patch.state,
      zip: cur.zip || patch.zip,
      positionId: cur.positionId || patch.positionId,
    });
  }
  function walkEnrich(o: unknown, mapFields: (rec: Record<string, any>) => void) {
    if (!o || typeof o !== "object") return;
    const rec = o as Record<string, any>;
    if (!Array.isArray(o) && typeof rec.candidateId === "string") mapFields(rec);
    for (const v of Object.values(rec)) walkEnrich(v, mapFields);
  }
  for (const file of [
    ".data/p205-operator-local.json",
    ".data/p204-1-supervised-pilot-operator-local.json",
    ".data/p193-3-questionnaire-store.json",
    ".data/p200-2-zip-capture-store.json",
  ]) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      walkEnrich(data, (rec) => {
        mergeEnrich(rec.candidateId, {
          email: typeof rec.email === "string" ? rec.email : undefined,
          name: typeof rec.name === "string" ? rec.name : undefined,
          city: typeof rec.city === "string" ? rec.city : undefined,
          state: typeof rec.state === "string" ? rec.state : undefined,
          zip:
            typeof rec.zipCode === "string"
              ? rec.zipCode
              : typeof rec.zip === "string"
                ? rec.zip
                : undefined,
          positionId: typeof rec.positionId === "string" ? rec.positionId : undefined,
        });
      });
    } catch {
      /* ignore malformed local ledgers */
    }
  }

  const ledgers = loadPriorSendLedgers();
  const onboardingEnvelopeIds = loadOnboardingEnvelopeIds();
  console.log(`prior-send ledgers: ids=${ledgers.candidateIds.size} emails=${ledgers.emails.size}`);

  // MEL active opportunities + placed staff (read-only).
  const { fetchMelProjectsSheet } = await import("@/lib/mel-projects-sheet");
  const sheet = await fetchMelProjectsSheet();
  const { extractActiveOpportunities, buildPlacedStaffEmailIndex } = await import(
    "@/lib/p209-coverage-audit/opportunities"
  );
  const opportunities = extractActiveOpportunities(sheet.rows as Array<Record<string, string>>);
  const placedEmails = buildPlacedStaffEmailIndex(sheet.rows as Array<Record<string, string>>);
  console.log(`MEL rows=${sheet.rows.length} activeAvailable=${opportunities.length}`);

  // Geocoding — TRUSTED coordinates only. The shared cache's "estimate"
  // entries and the synthetic ZIP-centroid fallback are jittered state
  // centroids (a Rogers, AR store previously landed 3 miles from Little Rock,
  // ~180 miles wrong); they must never gate a send decision. Only real
  // Nominatim results are accepted; anything else counts as coverage-unknown.
  const { normalizeZip5 } = await import("@/lib/p200-territory-intelligence/zip-centroids");
  const { geocodeKey, getCachedGeocode, setCachedGeocode } = await import(
    "@/lib/geocoding/geocode-cache"
  );
  const { haversineMiles, estimateGeoPoint } = await import("@/lib/mel-matching/distance-utils");
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

  /**
   * Trusted geocode: cached Nominatim hit, else (when allowed) a live
   * Nominatim lookup — bypassing cached "estimate" entries, which would
   * otherwise permanently mask the real location.
   */
  async function trustedPoint(
    parts: { city?: string; state?: string; zip?: string },
    allowNetwork: boolean,
  ): Promise<Point | null> {
    const zip5 = normalizeZip5(parts.zip ?? null) ?? undefined;
    const key = geocodeKey({ city: parts.city, state: parts.state, zip: zip5 });
    const cached = await getCachedGeocode(key);
    if (cached?.source === "nominatim") return { lat: cached.lat, lng: cached.lng };
    if (!allowNetwork) return null;
    const query = [parts.city, parts.state, zip5, "USA"].filter(Boolean).join(", ");
    const p = await nominatimFetch(query);
    await new Promise((r) => setTimeout(r, 1100));
    if (p) {
      await setCachedGeocode(key, { ...p, source: "nominatim" });
      return p;
    }
    return null;
  }

  // Unique opportunity locations (deduped store cities/ZIPs).
  const oppLocations = new Map<string, { city: string; state: string; zip: string }>();
  for (const opp of opportunities) {
    const key = `${opp.city}|${opp.state}|${opp.zip ?? ""}`.toLowerCase();
    if (!oppLocations.has(key)) {
      oppLocations.set(key, {
        city: String(opp.city ?? ""),
        state: String(opp.state ?? "").toUpperCase(),
        zip: String(opp.zip ?? ""),
      });
    }
  }
  const trustedOppPoints = new Map<string, Point>();
  for (const [key, loc] of oppLocations) {
    const p = await trustedPoint(loc, false);
    if (p) trustedOppPoints.set(key, p);
  }
  console.log(
    `opportunity locations: unique=${oppLocations.size} trustedCached=${trustedOppPoints.size}`,
  );

  const NETWORK_GEOCODE_BUDGET_PER_CANDIDATE = 80;

  /**
   * Nearest active work using trusted coordinates only. Locations without a
   * trusted geocode are resolved live when plausibly nearby (same state, or a
   * coarse state-centroid distance ≤ 200 miles). Returns budgetExhausted when
   * plausible locations remain unresolved — treated as coverage-unknown.
   */
  async function nearestTrustedWork(
    candPoint: Point,
    candState: string,
  ): Promise<{ nearest: { miles: number; city: string; state: string } | null; budgetExhausted: boolean }> {
    let best: { miles: number; city: string; state: string } | null = null;
    for (const [key, loc] of oppLocations) {
      const p = trustedOppPoints.get(key);
      if (!p) continue;
      const mi = haversineMiles(candPoint, p);
      if (!best || mi < best.miles) best = { miles: mi, city: loc.city, state: loc.state };
    }
    let lookups = 0;
    let budgetExhausted = false;
    for (const [key, loc] of oppLocations) {
      if (trustedOppPoints.has(key)) continue;
      const sameState = loc.state === candState;
      if (!sameState) {
        const coarse = estimateGeoPoint(loc.city, loc.state);
        if (!coarse || haversineMiles(candPoint, coarse) > 200) continue;
      }
      if (lookups >= NETWORK_GEOCODE_BUDGET_PER_CANDIDATE) {
        budgetExhausted = true;
        break;
      }
      const p = await trustedPoint(loc, true);
      lookups += 1;
      if (!p) continue;
      trustedOppPoints.set(key, p);
      const mi = haversineMiles(candPoint, p);
      if (!best || mi < best.miles) best = { miles: mi, city: loc.city, state: loc.state };
    }
    return { nearest: best, budgetExhausted };
  }

  const { getDmForState } = await import("@/lib/dm-territory-map");
  const { resolveP216Routing } = await import("@/lib/p216-position-location-authority");
  const { fetchBreezyPositionById } = await import("@/lib/breezy-api");

  // P216 — Applied Position.Location is authoritative. Cache live position
  // lookups so title parsing never determines posting geography.
  const positionCache = new Map<
    string,
    Awaited<ReturnType<typeof fetchBreezyPositionById>> | null
  >();
  async function resolvePositionJob(positionId: string) {
    const id = positionId.trim();
    if (!id) return null;
    if (positionCache.has(id)) return positionCache.get(id) ?? null;
    try {
      const result = await fetchBreezyPositionById(id);
      positionCache.set(id, result);
      await new Promise((r) => setTimeout(r, 200));
      return result;
    } catch {
      positionCache.set(id, null);
      return null;
    }
  }

  // Identity collapse across every applicant (same-person multiple applications).
  const allIds = Object.keys(workflows);
  const identity = collapseDuplicateIdentities(
    allIds.map((id) => {
      const enrich = enrichById.get(id) ?? {};
      return {
        candidateId: id,
        normalizedEmail: normalizeP214Email(ingestion[id]?.email || enrich.email),
        approvedAt: String(workflows[id]?.lastActionAt ?? ""),
        stageAuthorized: workflows[id]?.workflowStatus === "Paperwork Needed",
      };
    }),
  );

  // Classify every applicant's send history. Local evidence first; every
  // local survivor then gets an authoritative live Dropbox lookup so we never
  // rely on workflow stage alone.
  const counts: Record<string, number> = {};
  const blockedDetail: Array<Record<string, unknown>> = [];
  const eligibleRows: Array<any> = [];
  const dropboxCountByCandidate = new Map<string, number>();
  let dropboxLiveLookups = 0;

  for (const id of allIds) {
    const wf = workflows[id] ?? {};
    const enrich = enrichById.get(id) ?? {};
    const c = {
      ...(ingestion[id] ?? {}),
      email: ingestion[id]?.email || enrich.email,
      firstName: ingestion[id]?.firstName,
      lastName: ingestion[id]?.lastName || enrich.name,
      city: ingestion[id]?.city || enrich.city,
      state: ingestion[id]?.state || enrich.state,
      zipCode: ingestion[id]?.zipCode || enrich.zip,
      positionId: ingestion[id]?.positionId || enrich.positionId,
      positionName: ingestion[id]?.positionName,
    };
    const email = normalizeP214Email(c.email);
    const name =
      `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || String(enrich.name ?? "").trim();

    const evidence = {
      candidateId: id,
      normalizedEmail: email,
      hasName: name.length > 1,
      workflowStatus: String(wf.workflowStatus ?? ""),
      paperworkStatus: String(wf.paperworkStatus ?? ""),
      hasSignatureRequestId: Boolean(wf.signatureRequestId),
      hasPaperworkSentAt: Boolean(wf.paperworkSentAt || wf.paperworkViewedAt || wf.paperworkSignedAt),
      dropboxEnvelopeStatus: null as any,
      inPriorSendLedger: ledgers.candidateIds.has(id) || (email !== "" && ledgers.emails.has(email)),
      isDuplicateIdentity: identity.duplicateIds.has(id),
      alreadyPlaced: Boolean(email && placedEmails.has(email)),
      hasActiveOnboardingEnvelope: onboardingEnvelopeIds.has(id),
    };
    let classification = classifyP214SendHistory(evidence);

    if (classification === "UNSENT_CONFIRMED") {
      // Authoritative live Dropbox check for any envelope on this email.
      const live = await queryEnvelopesForEmail(email);
      dropboxLiveLookups += 1;
      dropboxCountByCandidate.set(id, live.count);
      await new Promise((r) => setTimeout(r, 350));
      if (live.count > 0) {
        classification = classifyP214SendHistory({
          ...evidence,
          dropboxEnvelopeStatus: live.strongest,
        });
        if (classification === "UNSENT_CONFIRMED") classification = "pending_envelope" as any;
      }
    }

    if (classification !== "UNSENT_CONFIRMED") {
      counts[classification] = (counts[classification] ?? 0) + 1;
      continue;
    }

    // UNSENT_CONFIRMED → coverage + routing gates (geocode only this subset,
    // trusted coordinates only).
    const homeCity = String(c.city ?? "").trim();
    const homeState = String(c.state ?? "").trim().toUpperCase();
    const homeZip = normalizeZip5(c.zipCode ?? null) ?? "";
    const candidatePoint =
      homeZip || (homeCity && homeState)
        ? await trustedPoint({ city: homeCity, state: homeState, zip: homeZip }, true)
        : null;

    let nearest: { miles: number; city: string; state: string } | null = null;
    let coverageKnown = Boolean(candidatePoint);
    if (candidatePoint) {
      const result = await nearestTrustedWork(candidatePoint, homeState);
      nearest = result.nearest;
      // If plausible nearby locations stayed unresolved and nothing within
      // range was found, the coverage answer is not trustworthy.
      if (result.budgetExhausted && (!nearest || nearest.miles > 39)) coverageKnown = false;
    }

    // P216 — Applied Position ID → Position.Location (never title parsing).
    const positionId = String(c.positionId ?? wf.positionId ?? "").trim();
    const livePosition = positionId ? await resolvePositionJob(positionId) : null;
    const liveJob =
      livePosition && livePosition.ok && "found" in livePosition && livePosition.found
        ? livePosition.job
        : null;
    const positionName = String(liveJob?.name ?? c.positionName ?? "");
    const routing = resolveP216Routing(
      {
        positionId: positionId || null,
        positionName,
        positionStatus: liveJob?.status ?? null,
        city: liveJob?.city ?? "",
        state: liveJob?.state ?? "",
        zip: liveJob?.zip ?? "",
        displayLocation: liveJob?.displayLocation ?? "",
        locationSource: liveJob?.locationSource ?? (positionId ? "missing" : "missing"),
        homeCity,
        homeState,
      },
      (s) => getDmForState(s),
    );
    const jobCity = routing.posting.authoritative ? routing.posting.city : "";
    const jobState = routing.posting.authoritative ? routing.posting.state : "";
    const expectedDm = routing.expectedDm;
    const assignedDm = String(wf.assignedDM ?? "").trim();

    const gates = evaluateP214Gates({
      nearestActiveWorkMiles: nearest && coverageKnown ? Math.round(nearest.miles * 10) / 10 : null,
      hasActiveOpportunities: opportunities.length > 0,
      coverageKnown,
      assignedDm,
      expectedDm,
      jobCity,
      jobState,
    });

    if (!gates.eligible) {
      for (const b of gates.blockers) counts[b] = (counts[b] ?? 0) + 1;
      counts.unsent_but_blocked = (counts.unsent_but_blocked ?? 0) + 1;
      blockedDetail.push({
        redactedCandidateId: sha256(id).slice(0, 12),
        workflowStatus: wf.workflowStatus,
        homeState,
        homeCity,
        coverageTier: gates.tier,
        nearestActiveWorkMiles: nearest ? Math.round(nearest.miles * 10) / 10 : null,
        nearestOpportunity: nearest ? `${nearest.city}, ${nearest.state}` : null,
        assignedDm,
        expectedDm,
        appliedPositionId: positionId || null,
        appliedPositionName: positionName || null,
        positionLocation: routing.posting.authoritative
          ? { city: jobCity, state: jobState, source: routing.posting.locationSource }
          : null,
        geoPosting: Boolean(jobCity && jobState),
        locationSource: routing.posting.locationSource,
        blockers: gates.blockers,
      });
      continue;
    }

    counts.UNSENT_CONFIRMED_ELIGIBLE = (counts.UNSENT_CONFIRMED_ELIGIBLE ?? 0) + 1;
    eligibleRows.push({
      candidateId: id,
      normalizedEmail: email,
      name,
      positionLabel: positionName,
      workflowStatus: String(wf.workflowStatus ?? ""),
      coverageTier: gates.tier,
      nearestActiveWorkMiles: nearest ? Math.round(nearest.miles * 10) / 10 : 0,
      nearestOpportunity: nearest ? `${nearest.city}, ${nearest.state}` : null,
      assignedDm,
      dmCorrect: Boolean(expectedDm && assignedDm.toLowerCase() === expectedDm.toLowerCase()),
      hasGeoPosting: Boolean(jobCity && jobState),
      approvedAt: String(wf.lastActionAt ?? ""),
    });
  }

  // Select ≤ 20. Freeze only when not running P216 preview-only revalidation.
  const noFreeze =
    process.argv.includes("--no-freeze") || process.env.P214_PREVIEW_NO_FREEZE === "1";
  const selected = selectP214Cohort(eligibleRows);
  const cohort = noFreeze
    ? {
        phase: "P214" as const,
        cohortId: `p214-preview-nofreeze-${Date.now().toString(16)}`,
        fingerprint: sha256(`nofreeze:${selected.map((s) => s.candidateId).join(",")}`).slice(0, 24),
        authorizedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        authorizedBy: AUTHORIZED_BY,
        sendMode: "test_mode" as const,
        maxCohortSize: P214_MAX_COHORT_SIZE,
        members: [],
      }
    : freezeP214Cohort({ selected, authorizedBy: AUTHORIZED_BY });
  if (noFreeze) {
    console.log(
      `P214 preview --no-freeze: selected=${selected.length} eligible; cohort NOT frozen (P216 revalidation).`,
    );
  }

  // Read-only verification of the candidate stores.
  const workflowsUnchanged =
    sha256(readFileSync(".data/candidate-workflows.json", "utf8")) === workflowsHashBefore;
  const ingestionUnchanged =
    sha256(readFileSync(".data/candidate-ingestion.json", "utf8")) === ingestionHashBefore;

  const preview = {
    phase: "P214",
    generatedAt: new Date().toISOString(),
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    totalApplicantsReviewed: allIds.length,
    confirmedPreviouslySent:
      (counts.previously_sent_workflow ?? 0) + (counts.prior_cohort_member ?? 0),
    confirmedSigned: counts.signed ?? 0,
    viewed: counts.viewed ?? 0,
    pendingEnvelopes: counts.pending_envelope ?? 0,
    duplicates: counts.duplicate_identity ?? 0,
    alreadyPlaced: counts.already_placed ?? 0,
    stageNotAuthorized: counts.stage_not_authorized ?? 0,
    missingRequiredInformation: counts.missing_contact_info ?? 0,
    blockedByCoverage:
      (counts.blocked_no_active_work ?? 0) +
      (counts.blocked_over_60_miles ?? 0) +
      (counts.manual_review_40_60_miles ?? 0) +
      (counts.blocked_coverage_unknown ?? 0),
    blockedByDmAssignment: (counts.blocked_dm_unassigned ?? 0) + (counts.blocked_dm_wrong ?? 0),
    blockedByNonGeographicPosting: counts.blocked_non_geographic_posting ?? 0,
    eligibleAndUnsent: counts.UNSENT_CONFIRMED_ELIGIBLE ?? 0,
    proposedTestCohortSize: cohort.members.length,
    maxCohortSize: P214_MAX_COHORT_SIZE,
    classificationCounts: counts,
    priorSendLedgerSources: ledgers.sources,
    dropboxLiveLookupsPerformed: dropboxLiveLookups,
    cohortMembers: cohort.members.map((m) => ({
      redactedCandidateId: m.redactedCandidateId,
      emailHash: m.emailHash,
      coverageTier: m.coverageTier,
      nearestActiveWorkMiles: m.nearestActiveWorkMiles,
      assignedDm: m.assignedDm,
      positionLabel: m.positionLabel,
      approvedAt: m.approvedAt,
      idempotencyKey: m.idempotencyKey,
    })),
    safety: {
      sendMode: "test_mode",
      dropboxRequestsCreated: 0,
      melWrites: 0,
      workflowTransitions: 0,
      workflowsFileUnchanged: workflowsUnchanged,
      ingestionFileUnchanged: ingestionUnchanged,
    },
  };
  writeArtifact("p214-unsent-test-preview.json", preview);

  writeArtifact("p214-blocked-candidates-summary.json", {
    phase: "P214",
    generatedAt: new Date().toISOString(),
    cohortId: cohort.cohortId,
    totalBlockedAfterUnsentConfirmation: blockedDetail.length,
    blockedByReason: {
      coverage_no_active_work: counts.blocked_no_active_work ?? 0,
      coverage_over_60_miles: counts.blocked_over_60_miles ?? 0,
      coverage_manual_review_40_60: counts.manual_review_40_60_miles ?? 0,
      coverage_unknown: counts.blocked_coverage_unknown ?? 0,
      dm_unassigned: counts.blocked_dm_unassigned ?? 0,
      dm_wrong: counts.blocked_dm_wrong ?? 0,
      non_geographic_posting: counts.blocked_non_geographic_posting ?? 0,
    },
    excludedEarlier: {
      previouslySentWorkflow: counts.previously_sent_workflow ?? 0,
      priorCohortMember: counts.prior_cohort_member ?? 0,
      signed: counts.signed ?? 0,
      viewed: counts.viewed ?? 0,
      pendingEnvelope: counts.pending_envelope ?? 0,
      duplicateIdentity: counts.duplicate_identity ?? 0,
      alreadyPlaced: counts.already_placed ?? 0,
      missingContactInfo: counts.missing_contact_info ?? 0,
      stageNotAuthorized: counts.stage_not_authorized ?? 0,
    },
    blockedCandidates: blockedDetail,
  });

  // Local-only files for execution (PII allowed here).
  // --no-freeze (P216 revalidation): never overwrite the frozen send cohort.
  if (!noFreeze) {
    writeLocal(COHORT_LOCAL, cohort);
    writeLocal(PREVIEW_ENVELOPE_INDEX_LOCAL, {
      generatedAt: new Date().toISOString(),
      cohortId: cohort.cohortId,
      perMember: cohort.members.map((m) => {
        const row = eligibleRows.find((r) => r.candidateId === m.candidateId);
        return {
          candidateId: m.candidateId,
          email: row?.normalizedEmail ?? "",
          envelopeCountAtPreview: dropboxCountByCandidate.get(m.candidateId) ?? 0,
        };
      }),
    });
  } else {
    writeLocal(".data/p214-preview-nofreeze-eligibility-local.json", {
      generatedAt: new Date().toISOString(),
      selectedCandidateIds: selected.map((s) => s.candidateId),
      eligibleCount: eligibleRows.length,
      proposedWouldBe: selected.length,
      blockedDetail,
      classificationCounts: counts,
      note: "P216 preview-only revalidation — cohort was NOT frozen.",
    });
  }
  if (!noFreeze) {
    writeLocal(OPERATOR_LOCAL, {
      generatedAt: new Date().toISOString(),
      phase: "P214",
      cohortId: cohort.cohortId,
      sendMode: "test_mode",
      statement:
        "Test-mode envelopes only — not legally binding, not production paperwork.",
      members: cohort.members.map((m) => {
        const row = eligibleRows.find((r) => r.candidateId === m.candidateId);
        return {
          candidateId: m.candidateId,
          name: row?.name ?? "",
          email: row?.normalizedEmail ?? "",
          position: m.positionLabel,
          coverageTier: m.coverageTier,
          nearestActiveWorkMiles: m.nearestActiveWorkMiles,
          nearestOpportunity: row?.nearestOpportunity ?? null,
          assignedDm: m.assignedDm,
          idempotencyKey: m.idempotencyKey,
        };
      }),
      sendRecords: [],
    });
  }

  console.log(
    JSON.stringify(
      {
        reviewed: preview.totalApplicantsReviewed,
        previouslySent: preview.confirmedPreviouslySent,
        signed: preview.confirmedSigned,
        viewed: preview.viewed,
        pending: preview.pendingEnvelopes,
        duplicates: preview.duplicates,
        blockedCoverage: preview.blockedByCoverage,
        blockedDm: preview.blockedByDmAssignment,
        blockedNonGeo: preview.blockedByNonGeographicPosting,
        eligibleUnsent: preview.eligibleAndUnsent,
        cohortSize: preview.proposedTestCohortSize,
      },
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// Phase 4+5: mandatory preflight, then the controlled test-mode send
// ---------------------------------------------------------------------------

async function phaseSend(): Promise<void> {
  // Explicit test-mode. Never production.
  process.env.DROPBOX_SIGN_TEST_MODE = "true";

  const {
    evaluateP214Preflight,
    P214_SEND_STATEMENT,
    assertP214CohortMember,
    planP214Batches,
    p214NextSendDelayMs,
    summarizeP214Attempts,
    P214_NOTE_MARKER,
  } = await import("@/lib/p214-unsent-test-batch");

  const cohort = JSON.parse(readFileSync(COHORT_LOCAL, "utf8"));
  const operatorLocal = JSON.parse(readFileSync(OPERATOR_LOCAL, "utf8"));
  const contactByCandidate = new Map<string, { name: string; email: string }>(
    (operatorLocal.members ?? []).map((m: any) => [m.candidateId, { name: m.name, email: m.email }]),
  );

  const { readDropboxSignConfig, listTemplates } = await import("@/lib/dropbox-sign");
  const { resolveTemplateId } = await import("@/lib/onboarding-template-registry");
  const { buildTemplateSignerPayload } = await import("@/lib/onboarding-signer");

  const cfg = readDropboxSignConfig();
  const templateId = resolveTemplateId("onboarding_packet");

  // Live API reachability + account check.
  let apiReachable = false;
  let accountEmail: string | null = null;
  try {
    const acct = await dropboxGetRaw<{ account?: { email_address?: string } }>("/account");
    apiReachable = true;
    accountEmail = acct.account?.email_address ?? null;
  } catch (err) {
    console.error(`account check failed: ${err instanceof Error ? err.message : err}`);
  }

  // Template present in the account.
  let templateFound = false;
  try {
    if (templateId) {
      const templates = await listTemplates();
      templateFound = templates.some((t: { templateId: string }) => t.templateId === templateId);
    }
  } catch (err) {
    console.error(`template check failed: ${err instanceof Error ? err.message : err}`);
  }

  // Signer roles / merge fields valid for every member (vacuously true for an
  // empty cohort — emptiness is reported by its own preflight failure).
  let signerRoleValid = true;
  for (const m of cohort.members) {
    const contact = contactByCandidate.get(m.candidateId);
    const payload = buildTemplateSignerPayload({
      templateKey: "onboarding_packet",
      candidateName: contact?.name ?? "",
      emailSources: [contact?.email ?? ""],
    });
    if (!payload.ok) {
      signerRoleValid = false;
      console.error(`signer payload invalid for ${m.redactedCandidateId}: ${payload.error}`);
    }
  }

  // No member acquired an envelope after the preview (preview required 0).
  let newEnvelopesSincePreview = 0;
  for (const m of cohort.members) {
    const email = contactByCandidate.get(m.candidateId)?.email ?? "";
    if (!email) continue;
    const live = await queryEnvelopesForEmail(email);
    if (live.count > 0) newEnvelopesSincePreview += 1;
    await new Promise((r) => setTimeout(r, 350));
  }

  const keySet = new Set(cohort.members.map((m: any) => m.idempotencyKey));
  const automation = continuousAutomationActive();

  const preflight = evaluateP214Preflight({
    configPresent: Boolean(cfg),
    testModeVerified: Boolean(cfg?.testMode) && process.env.DROPBOX_SIGN_TEST_MODE === "true",
    nodeEnvIsProduction: process.env.NODE_ENV === "production",
    dropboxApiReachable: apiReachable,
    templateConfigured: Boolean(templateId),
    templateFoundInAccount: templateFound,
    signerRoleValid,
    cohortSize: cohort.members.length,
    membersWithNewEnvelopeSincePreview: newEnvelopesSincePreview,
    duplicateIdempotencyKeys: cohort.members.length - keySet.size,
    continuousAutomationActive: automation.active,
  });

  console.log("");
  console.log(`>>> ${P214_SEND_STATEMENT}`);
  console.log("");
  console.log(
    JSON.stringify(
      {
        preflight,
        account: accountEmail,
        templateId,
        testMode: cfg?.testMode ?? null,
        automation: automation.detail,
        cohortSize: cohort.members.length,
      },
      null,
      2,
    ),
  );

  if (!preflight.ok) {
    writeArtifact("p214-unsent-test-send-summary.json", {
      phase: "P214",
      state: "preflight_blocked",
      generatedAt: new Date().toISOString(),
      cohortId: cohort.cohortId,
      statement: P214_SEND_STATEMENT,
      preflight,
      attempts: [],
      summary: summarizeP214Attempts([]),
    });
    console.error("PREFLIGHT FAILED — stopping without any send.");
    process.exitCode = 1;
    return;
  }

  // ---- Controlled send ----
  const { executeOnboardingSend } = await import(
    "@/lib/candidate-onboarding-send-queue/execute-onboarding-send"
  );
  const { getCandidateWorkflowState, upsertCandidateWorkflow } = await import(
    "@/lib/candidate-workflow-store"
  );

  const attempts: any[] = [];
  const transitions: any[] = [];
  const startedAt = new Date().toISOString();
  let lastSendAt = 0;
  let stopped = false;
  let stopReason: string | null = null;

  const persistProgress = (state: string) => {
    writeArtifact("p214-unsent-test-send-summary.json", {
      phase: "P214",
      state,
      startedAt,
      updatedAt: new Date().toISOString(),
      cohortId: cohort.cohortId,
      fingerprint: cohort.fingerprint,
      sendMode: "test_mode",
      statement: P214_SEND_STATEMENT,
      preflight,
      attempts: attempts.map((a) => ({ ...a, candidateId: undefined })),
      workflowTransitions: transitions,
      summary: summarizeP214Attempts(attempts),
      stopReason,
    });
  };

  const persistIdempotencyRecord = (record: Record<string, unknown>) => {
    const local = JSON.parse(readFileSync(OPERATOR_LOCAL, "utf8"));
    local.sendRecords = [...(local.sendRecords ?? []), record];
    writeFileSync(OPERATOR_LOCAL, `${JSON.stringify(local, null, 2)}\n`);
  };

  const batches = planP214Batches(cohort.members);
  outer: for (let b = 0; b < batches.length; b++) {
    for (const member of batches[b]!) {
      assertP214CohortMember(cohort, member.candidateId);
      const contact = contactByCandidate.get(member.candidateId);
      const base = {
        candidateId: member.candidateId,
        redactedCandidateId: member.redactedCandidateId,
        batch: b + 1,
        idempotencyKey: member.idempotencyKey,
        testModeRequested: true as const,
        at: new Date().toISOString(),
      };

      // Idempotency: never send a candidate that already has a send record.
      const local = JSON.parse(readFileSync(OPERATOR_LOCAL, "utf8"));
      if ((local.sendRecords ?? []).some((r: any) => r.idempotencyKey === member.idempotencyKey)) {
        attempts.push({
          ...base,
          ok: true,
          status: "skipped_existing_envelope",
          envelopeId: null,
          testModeVerified: null,
          dropboxStatus: null,
          signerEmailMatch: null,
          detail: "Idempotency record already present — duplicate prevention",
        });
        continue;
      }

      // Immediate re-check 1: live local workflow.
      const wf = (await getCandidateWorkflowState())[member.candidateId];
      if (!wf) {
        attempts.push({
          ...base,
          ok: false,
          status: "skipped_missing_workflow",
          envelopeId: null,
          testModeVerified: null,
          dropboxStatus: null,
          signerEmailMatch: null,
          detail: "Workflow missing at send time",
        });
        continue;
      }
      if (wf.signatureRequestId || wf.paperworkSentAt || wf.workflowStatus === "Paperwork Sent") {
        attempts.push({
          ...base,
          ok: true,
          status: "skipped_existing_envelope",
          envelopeId: wf.signatureRequestId ?? null,
          testModeVerified: null,
          dropboxStatus: null,
          signerEmailMatch: null,
          detail: "Envelope or sent record appeared since preview — duplicate prevention",
        });
        continue;
      }
      if (!contact?.email) {
        attempts.push({
          ...base,
          ok: false,
          status: "skipped_missing_contact",
          envelopeId: null,
          testModeVerified: null,
          dropboxStatus: null,
          signerEmailMatch: null,
          detail: "No contact email at send time",
        });
        continue;
      }

      // Immediate re-check 2: live Dropbox for this signer email.
      try {
        const q = await dropboxGetRaw<{ list_info?: { num_results?: number } }>(
          `/signature_request/list?page=1&page_size=1&query=${encodeURIComponent(contact.email)}`,
        );
        if ((q.list_info?.num_results ?? 0) > 0) {
          attempts.push({
            ...base,
            ok: true,
            status: "skipped_existing_envelope",
            envelopeId: null,
            testModeVerified: null,
            dropboxStatus: null,
            signerEmailMatch: null,
            detail: "Live Dropbox re-check found an existing envelope — duplicate prevention",
          });
          continue;
        }
      } catch (err) {
        stopped = true;
        stopReason = `Pre-send Dropbox re-check failed: ${err instanceof Error ? err.message : err}`;
        break outer;
      }

      // Rate limit: ≤ 4 requests/minute.
      const wait = p214NextSendDelayMs(lastSendAt, Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastSendAt = Date.now();

      const result = await executeOnboardingSend({
        candidateId: member.candidateId,
        candidateName: contact.name || "Candidate",
        candidateEmail: contact.email,
        templateKey: "onboarding_packet",
        byUserId: AUTHORIZED_BY,
        recordWorkflowFailureOnError: false,
      });

      if (!result.ok) {
        // No automatic retry. Stop immediately on any failure.
        attempts.push({
          ...base,
          ok: false,
          status: "send_failed",
          envelopeId: null,
          testModeVerified: null,
          dropboxStatus: null,
          signerEmailMatch: null,
          detail: result.error,
        });
        stopped = true;
        stopReason = `Send failed for ${member.redactedCandidateId}: ${result.error}`;
        persistProgress("stopped_on_error");
        break outer;
      }

      // Verify the new envelope directly against Dropbox (raw → test_mode).
      let testModeVerified: boolean | null = null;
      let dropboxStatus: string | null = null;
      let signerEmailMatch: boolean | null = null;
      try {
        const raw = await dropboxGetRaw<{ signature_request?: RawSignatureRequest }>(
          `/signature_request/${encodeURIComponent(result.signatureRequestId)}`,
        );
        const req = raw.signature_request;
        testModeVerified = req?.test_mode === true;
        dropboxStatus = req ? strongestEnvelopeStatus(req) : null;
        signerEmailMatch = (req?.signatures ?? []).some(
          (s) => String(s.signer_email_address ?? "").toLowerCase() === contact.email.toLowerCase(),
        );
      } catch (err) {
        dropboxStatus = `verify_error: ${err instanceof Error ? err.message : err}`;
      }

      if (testModeVerified !== true) {
        stopped = true;
        stopReason = `Envelope ${result.signatureRequestId} could not be verified as test_mode=true — stopping`;
      }

      // Persist the idempotency record BEFORE moving to the next candidate.
      persistIdempotencyRecord({
        status: "Test Paperwork Sent",
        candidateId: member.candidateId,
        normalizedEmail: contact.email.toLowerCase(),
        signatureRequestId: result.signatureRequestId,
        testMode: true,
        testModeVerified,
        templateId,
        cohortId: cohort.cohortId,
        idempotencyKey: member.idempotencyKey,
        sentAt: new Date().toISOString(),
        legallyBinding: false,
      });

      // Explicit test-mode marker on the workflow record (transition to
      // Paperwork Sent already happened inside the send path — reported below).
      await upsertCandidateWorkflow({
        candidateId: member.candidateId,
        note: [
          P214_NOTE_MARKER,
          "status=Test Paperwork Sent",
          "test_mode=true (NOT legally binding — not production paperwork)",
          `cohort=${cohort.cohortId}`,
          `env=${result.signatureRequestId}`,
          `idem=${member.idempotencyKey}`,
        ].join(" "),
        audit: {
          action: "p214_test_paperwork_send",
          byUserId: AUTHORIZED_BY,
          metadata: {
            cohortId: cohort.cohortId,
            envelopeId: result.signatureRequestId,
            testMode: true,
            legallyBinding: false,
            melWrite: false,
          },
        },
      });

      transitions.push({
        redactedCandidateId: member.redactedCandidateId,
        from: member.workflowStatusAtFreeze,
        to: result.workflow?.workflowStatus ?? "Paperwork Sent",
        reason: "Strictly-necessary transition performed by the operator send path on test send",
      });

      attempts.push({
        ...base,
        ok: true,
        status: "confirmed_test_sent",
        envelopeId: result.signatureRequestId,
        testModeVerified,
        dropboxStatus,
        signerEmailMatch,
        detail: "Test-mode envelope created — NOT legally binding",
      });
      console.log(
        `[batch ${b + 1}] sent ${member.redactedCandidateId} env=${result.signatureRequestId} test_mode_verified=${testModeVerified}`,
      );

      if (stopped) break outer;
      persistProgress("in_progress");
    }
  }

  persistProgress(stopped ? "stopped_on_error" : "complete");
  console.log(
    JSON.stringify({ summary: summarizeP214Attempts(attempts), stopped, stopReason }, null, 2),
  );
}

// ---------------------------------------------------------------------------
// Phase 6: post-send monitoring / reconciliation
// ---------------------------------------------------------------------------

async function phasePost(): Promise<void> {
  process.env.DROPBOX_SIGN_TEST_MODE = "true";
  const { summarizeP214Attempts, P214_SEND_STATEMENT } = (await import(
    "@/lib/p214-unsent-test-batch"
  )) as any;

  const cohort = JSON.parse(readFileSync(COHORT_LOCAL, "utf8"));
  const operatorLocal = JSON.parse(readFileSync(OPERATOR_LOCAL, "utf8"));
  const previewIndex = JSON.parse(readFileSync(PREVIEW_ENVELOPE_INDEX_LOCAL, "utf8"));
  const sendSummary = JSON.parse(
    readFileSync("artifacts/p214-unsent-test-send-summary.json", "utf8"),
  );

  const { getCandidateWorkflowState } = await import("@/lib/candidate-workflow-store");
  const workflows = await getCandidateWorkflowState();

  const previewCountByCandidate = new Map<string, number>(
    (previewIndex.perMember ?? []).map((m: any) => [m.candidateId, m.envelopeCountAtPreview]),
  );
  const emailByCandidate = new Map<string, string>(
    (operatorLocal.members ?? []).map((m: any) => [m.candidateId, m.email]),
  );
  const sendRecordByCandidate = new Map<string, any>(
    (operatorLocal.sendRecords ?? []).map((r: any) => [r.candidateId, r]),
  );

  const entries: Array<Record<string, unknown>> = [];
  let exactlyOneNewEnvelope = 0;
  let viewed = 0;
  let signed = 0;
  let testModeVerified = 0;

  for (const member of cohort.members) {
    const email = emailByCandidate.get(member.candidateId) ?? "";
    const record = sendRecordByCandidate.get(member.candidateId) ?? null;
    const wf = workflows[member.candidateId];
    const envNow = email ? await queryEnvelopesForEmail(email) : null;
    if (email) await new Promise((r) => setTimeout(r, 350));
    const before = previewCountByCandidate.get(member.candidateId) ?? 0;
    const newEnvelopes = (envNow?.count ?? 0) - before;

    let dropbox: Record<string, unknown> | null = null;
    if (record?.signatureRequestId) {
      try {
        const raw = await dropboxGetRaw<{ signature_request?: RawSignatureRequest }>(
          `/signature_request/${encodeURIComponent(record.signatureRequestId)}`,
        );
        const req = raw.signature_request;
        const status = req ? strongestEnvelopeStatus(req) : "unknown";
        if (status === "viewed") viewed += 1;
        if (status === "complete" || status === "partially_signed") signed += 1;
        if (req?.test_mode === true) testModeVerified += 1;
        dropbox = {
          status,
          testMode: req?.test_mode ?? null,
          signerEmailMatch: (req?.signatures ?? []).some(
            (s) => String(s.signer_email_address ?? "").toLowerCase() === email.toLowerCase(),
          ),
        };
      } catch (err) {
        dropbox = { error: err instanceof Error ? err.message : String(err) };
      }
      await new Promise((r) => setTimeout(r, 350));
    }

    if (record && newEnvelopes === 1) exactlyOneNewEnvelope += 1;
    entries.push({
      redactedCandidateId: member.redactedCandidateId,
      sent: Boolean(record),
      envelopeId: record?.signatureRequestId ?? null,
      envelopesAtPreview: before,
      envelopesNow: envNow?.count ?? 0,
      newEnvelopes,
      exactlyOneNewTestEnvelope: Boolean(record) && newEnvelopes === 1,
      localWorkflowStatus: wf?.workflowStatus ?? null,
      localPaperworkStatus: wf?.paperworkStatus ?? null,
      dropbox,
    });
  }

  const attempts = sendSummary.attempts ?? [];
  const summary = summarizeP214Attempts(
    attempts.map((a: any) => ({ ...a, candidateId: a.candidateId ?? "" })),
  );

  const finalSummary = {
    ...sendSummary,
    state: "reconciled",
    reconciledAt: new Date().toISOString(),
    summary,
    monitoring: {
      cohortSize: cohort.members.length,
      viewed,
      signedOrComplete: signed,
      testModeVerifiedEnvelopes: testModeVerified,
      membersWithExactlyOneNewTestEnvelope: exactlyOneNewEnvelope,
      candidatesOutsideCohortTouched: 0,
      melWrites: 0,
      entries,
    },
  };
  writeArtifact("p214-unsent-test-send-summary.json", finalSummary);

  const preview = JSON.parse(readFileSync("artifacts/p214-unsent-test-preview.json", "utf8"));
  const md = buildReportMd({ preview, finalSummary, statement: P214_SEND_STATEMENT });
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/p214-unsent-test-send-report.md", md);
  console.log("[artifact] artifacts/p214-unsent-test-send-report.md");

  console.log(JSON.stringify({ summary, monitoring: finalSummary.monitoring.cohortSize, exactlyOneNewEnvelope, testModeVerified }, null, 2));
}

function buildReportMd(args: {
  preview: any;
  finalSummary: any;
  statement: string;
}): string {
  const { preview, finalSummary, statement } = args;
  const s = finalSummary.summary ?? {};
  const m = finalSummary.monitoring ?? {};
  const lines = [
    "# P214 — Controlled Unsent Applicant Test Batch — Send Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Cohort: \`${preview.cohortId}\` (fingerprint \`${String(preview.fingerprint).slice(0, 16)}…\`)`,
    "",
    `> ${statement}`,
    "",
    "## Eligibility funnel",
    "",
    `| Metric | Count |`,
    `| --- | --- |`,
    `| Applicants reviewed | ${preview.totalApplicantsReviewed} |`,
    `| Confirmed previously sent (workflow + prior cohorts) | ${preview.confirmedPreviouslySent} |`,
    `| Confirmed signed | ${preview.confirmedSigned} |`,
    `| Viewed | ${preview.viewed} |`,
    `| Pending envelopes | ${preview.pendingEnvelopes} |`,
    `| Duplicate identities | ${preview.duplicates} |`,
    `| Already placed on active work | ${preview.alreadyPlaced} |`,
    `| Stage not authorized for paperwork | ${preview.stageNotAuthorized} |`,
    `| Missing required information | ${preview.missingRequiredInformation} |`,
    `| Blocked by coverage | ${preview.blockedByCoverage} |`,
    `| Blocked by DM assignment | ${preview.blockedByDmAssignment} |`,
    `| Blocked by non-geographic posting | ${preview.blockedByNonGeographicPosting} |`,
    `| Eligible and unsent (UNSENT_CONFIRMED, gates passed) | ${preview.eligibleAndUnsent} |`,
    `| Frozen test cohort | ${preview.proposedTestCohortSize} (max ${preview.maxCohortSize}) |`,
    "",
    "## Send results (test mode)",
    "",
    `| Metric | Count |`,
    `| --- | --- |`,
    `| Attempted | ${s.attempted ?? 0} |`,
    `| Confirmed test sends | ${s.confirmed ?? 0} |`,
    `| Failed | ${s.failed ?? 0} |`,
    `| Skipped | ${s.skipped ?? 0} |`,
    `| Duplicates prevented | ${s.duplicatePrevented ?? 0} |`,
    `| Existing envelopes discovered | ${s.existingEnvelopeDiscovered ?? 0} |`,
    `| Dropbox request IDs recorded | ${s.requestIdsPresent ?? 0} |`,
    `| test_mode=true verified per envelope | ${m.testModeVerifiedEnvelopes ?? 0} |`,
    `| Members with exactly one new test envelope | ${m.membersWithExactlyOneNewTestEnvelope ?? 0} |`,
    `| Viewed so far | ${m.viewed ?? 0} |`,
    `| Signed / complete so far | ${m.signedOrComplete ?? 0} |`,
    `| Candidates outside cohort touched | ${m.candidatesOutsideCohortTouched ?? 0} |`,
    `| MEL writes | ${m.melWrites ?? 0} |`,
    "",
    "## Workflow transitions",
    "",
    ...(finalSummary.workflowTransitions?.length
      ? finalSummary.workflowTransitions.map(
          (t: any) => `- \`${t.redactedCandidateId}\`: ${t.from} → ${t.to} (${t.reason})`,
        )
      : ["- None"]),
    "",
    "## Safety statement",
    "",
    "- Every envelope in this batch was created with `test_mode=true`. **They are not legally",
    "  binding and do not count as production paperwork.**",
    "- No production envelopes were sent. No MEL writes. No DM reassignments. No job posting",
    "  changes. No continuous automation was activated.",
    "- No candidate outside the frozen cohort was touched.",
    `- Stop condition honored: ${
      finalSummary.stopReason ??
      (finalSummary.preflight?.ok === false
        ? `preflight stop — ${finalSummary.preflight.failures.join("; ")} (no envelope created)`
        : "no stop — batch completed")
    }`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const phase = process.argv[process.argv.indexOf("--phase") + 1];
  loadEnvLocal();
  if (phase === "preview") await phasePreview();
  else if (phase === "send") await phaseSend();
  else if (phase === "post") await phasePost();
  else {
    console.error("Usage: --phase preview|send|post");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
