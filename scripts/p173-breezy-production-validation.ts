/**
 * P173 — Breezy Production Data Validation & Parity Audit (read-only)
 *
 * Usage: npx tsx scripts/p173-breezy-production-validation.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { isMtdApplicant } from "@/lib/candidate-ingestion/candidate-queue-scope";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadP171LifecycleState } from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import {
  findInIngestionStore,
  matchesP170Query,
} from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import { readIngestionStore as readStore } from "@/lib/candidate-ingestion/ingestion-store";

const WORKBOOK_PATH = path.join(process.cwd(), "diagnostics", "Breezy Info.xlsx");
const POSITIONS_SHEET = "Breezy_OpenPositions_Statistics";
const APPLICANTS_SHEET = "Breezy Applicants";

type BreezyExportPosition = {
  position: string;
  requisitionId: string;
  creator: string;
  location: string;
  daysOpen: number;
  applied: number;
  feedback: number;
  interviewing: number;
  madeOffer: number;
  disqualified: number;
  hired: number;
};

type BreezyExportCandidate = {
  breezyRowIndex: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  resume: string;
  positionName: string;
  location: string;
  city: string | null;
  state: string | null;
  source: string;
  recruiter: string;
  appliedAt: string;
  appliedDate: string;
  appliedTime: string;
  lastActivityAt: string | null;
};

type PlatformCandidate = BreezyCandidate & { sources: string[] };

type CandidateAuditRow = {
  export: BreezyExportCandidate;
  platformCandidateId: string | null;
  foundInBreezyExport: true;
  foundInIngestion: boolean;
  foundInWorkflow: boolean;
  foundInPreviewScan: boolean;
  foundInFastScan: boolean;
  foundInSoftwareUnion: boolean;
  searchableByName: boolean;
  searchableByEmail: boolean;
  searchableByPhone: boolean;
  searchableByCandidateId: boolean;
  searchableP170StoreOnly: boolean;
  searchableP170WouldNeedRescue: boolean;
  evaluatedByP157: boolean;
  inP171Lifecycle: boolean;
  p171LifecycleState: string | null;
  workflowStatus: string | null;
  paperworkStatus: string | null;
  assignedRecruiter: string | null;
  automationEligible: boolean;
  automationBlockers: string[];
  failurePoint: string | null;
  rootCauseCategory: string | null;
};

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

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/‚Äì/g, "–")
    .replace(/‚Äô/g, "'")
    .replace(/‚Äú|‚Äù/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function excelDateToIso(serial: number, timeFrac = 0): string {
  if (!serial || !Number.isFinite(serial)) return "";
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (timeFrac) {
    const secs = Math.round(timeFrac * 86400);
    d.setUTCHours(0, 0, 0, 0);
    d.setTime(d.getTime() + secs * 1000);
  }
  return d.toISOString();
}

function parseLocation(location: string): { city: string | null; state: string | null } {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0] ?? null, state: parts[parts.length - 1] ?? null };
  }
  return { city: location || null, state: null };
}

function loadBreezyWorkbook(): {
  positions: BreezyExportPosition[];
  candidates: BreezyExportCandidate[];
  sheetNotes: string[];
} {
  const wb = XLSX.readFile(WORKBOOK_PATH);
  const sheetNotes: string[] = [];
  if (!wb.SheetNames.includes(POSITIONS_SHEET)) {
    sheetNotes.push(`Missing sheet: ${POSITIONS_SHEET}`);
  }
  if (!wb.SheetNames.includes(APPLICANTS_SHEET)) {
    sheetNotes.push(`Expected sheet "Breezy Info" — found "${APPLICANTS_SHEET}" instead`);
  }

  const posRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[POSITIONS_SHEET] ?? {}, {
    defval: "",
  });
  const candRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[APPLICANTS_SHEET] ?? {}, {
    defval: "",
  });

  const positions: BreezyExportPosition[] = posRows.map((r) => ({
    position: String(r.Position ?? ""),
    requisitionId: String(r["Requisition ID"] ?? ""),
    creator: String(r.Creator ?? ""),
    location: String(r.Location ?? ""),
    daysOpen: Number(r["Days Open"] ?? 0),
    applied: Number(r.Applied ?? 0),
    feedback: Number(r.Feedback ?? 0),
    interviewing: Number(r.Interviewing ?? 0),
    madeOffer: Number(r["Made Offer"] ?? 0),
    disqualified: Number(r.Disqualified ?? 0),
    hired: Number(r.Hired ?? 0),
  }));

  const candidates: BreezyExportCandidate[] = candRows.map((r, index) => {
    const addedDate = Number(r.addedDate ?? 0);
    const addedTime = Number(r.addedTime ?? 0);
    const lastDate = Number(r.lastActivityDate ?? 0);
    const lastTime = Number(r.lastActivityTime ?? 0);
    const location = String(r.location ?? "");
    const { city, state } = parseLocation(location);
    const appliedAt = excelDateToIso(addedDate, addedTime);
    const d = appliedAt ? new Date(appliedAt) : null;
    return {
      breezyRowIndex: index + 2,
      name: String(r.name ?? ""),
      email: String(r.email_address ?? ""),
      phone: String(r.phone_number ?? ""),
      address: String(r.address ?? ""),
      resume: String(r.resume ?? ""),
      positionName: String(r.position ?? ""),
      location,
      city,
      state,
      source: String(r.source ?? ""),
      recruiter: String(r.sourced_by_name ?? ""),
      appliedAt,
      appliedDate: d ? d.toISOString().slice(0, 10) : "",
      appliedTime: d ? d.toISOString().slice(11, 19) : "",
      lastActivityAt: lastDate ? excelDateToIso(lastDate, lastTime) : null,
    };
  });

  candidates.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));

  return { positions, candidates, sheetNotes };
}

function buildPlatformIndex(candidates: PlatformCandidate[]): {
  byEmail: Map<string, PlatformCandidate[]>;
  byId: Map<string, PlatformCandidate>;
  byName: Map<string, PlatformCandidate[]>;
} {
  const byEmail = new Map<string, PlatformCandidate[]>();
  const byId = new Map<string, PlatformCandidate>();
  const byName = new Map<string, PlatformCandidate[]>();

  for (const c of candidates) {
    byId.set(c.candidateId, c);
    const email = normalizeEmail(c.email ?? "");
    if (email) {
      const list = byEmail.get(email) ?? [];
      list.push(c);
      byEmail.set(email, list);
    }
    const name = normalizeText(`${c.firstName ?? ""} ${c.lastName ?? ""}`);
    if (name) {
      const list = byName.get(name) ?? [];
      list.push(c);
      byName.set(name, list);
    }
  }
  return { byEmail, byId, byName };
}

function pickBestPlatformMatch(
  exportRow: BreezyExportCandidate,
  index: ReturnType<typeof buildPlatformIndex>,
): PlatformCandidate | null {
  const email = normalizeEmail(exportRow.email);
  if (email && index.byEmail.has(email)) {
    const matches = index.byEmail.get(email)!;
    if (exportRow.positionName) {
      const posNorm = normalizeText(exportRow.positionName);
      const byPos = matches.find(
        (m) =>
          normalizeText(m.positionName ?? "") === posNorm ||
          normalizeText(m.positionId ?? "") === posNorm,
      );
      if (byPos) return byPos;
    }
    return [...matches].sort((a, b) =>
      (b.appliedDate ?? "").localeCompare(a.appliedDate ?? ""),
    )[0]!;
  }
  const name = normalizeText(exportRow.name);
  const nameMatches = index.byName.get(name) ?? [];
  if (nameMatches.length === 1) return nameMatches[0]!;
  if (nameMatches.length > 1 && exportRow.positionName) {
    const posNorm = normalizeText(exportRow.positionName);
    return (
      nameMatches.find((m) => normalizeText(m.positionName ?? "") === posNorm) ??
      nameMatches[0]!
    );
  }
  return null;
}

function searchInPool(
  pool: BreezyCandidate[],
  query: string,
): boolean {
  const parsed = parseP170SearchQuery(query);
  return pool.some((c) => matchesP170Query(c, parsed));
}

function traceFailurePoint(input: {
  exportRow: BreezyExportCandidate;
  inPreview: boolean;
  inFast: boolean;
  inIngestion: boolean;
  inWorkflow: boolean;
  p170Store: boolean;
  platformMatch: PlatformCandidate | null;
}): { failurePoint: string | null; category: string | null } {
  if (input.inIngestion && input.inWorkflow) {
    return { failurePoint: null, category: null };
  }
  if (!input.inPreview && !input.inFast) {
    return {
      failurePoint: "Breezy API scan (preview/fast) — candidate not returned by live API",
      category: "candidate_synchronization",
    };
  }
  if ((input.inPreview || input.inFast) && !input.inIngestion) {
    return {
      failurePoint: "Ingestion store — API has candidate but durable ingestion has not merged them",
      category: "ingestion_issue",
    };
  }
  if (input.inIngestion && !input.inWorkflow) {
    return {
      failurePoint: "Workflow store — ingested but no workflow record (backfill/reconciliation gap)",
      category: "workflow_issue",
    };
  }
  if (input.p170Store) {
    return { failurePoint: null, category: null };
  }
  if (input.platformMatch && !input.inIngestion) {
    return {
      failurePoint: "P170 discovery store — visible in scan pool but not in ingestion index",
      category: "search_issue",
    };
  }
  return {
    failurePoint: "Unknown — no platform match by email/name",
    category: "candidate_synchronization",
  };
}

function matchJobByTitle(jobs: BreezyJob[], title: string): BreezyJob | null {
  const norm = normalizeText(title);
  return (
    jobs.find((j) => normalizeText(j.name) === norm) ??
    jobs.find((j) => normalizeText(j.name).includes(norm) || norm.includes(normalizeText(j.name))) ??
    null
  );
}

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();

  console.error("[P173] Loading Breezy export workbook…");
  const { positions: breezyPositions, candidates: breezyCandidates, sheetNotes } =
    loadBreezyWorkbook();

  console.error("[P173] Loading platform stores…");
  const [ingestionStore, workflowBundle, onboardingRecords, auditEvents, p171State] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      listAllCandidateOnboardingRecords().catch(() => []),
      loadPaperworkAutomationAuditLog().catch(() => []),
      loadP171LifecycleState(),
    ]);

  const ingestedList = listIngestedCandidates(ingestionStore);
  const workflowRecords = workflowBundle.workflows;

  console.error("[P173] Fetching live Breezy jobs + preview/fast scans (read-only)…");
  const [jobsResult, previewResult, fastResult] = await Promise.all([
    fetchBreezyJobs("published").catch(() => ({ ok: false as const, jobs: [] as BreezyJob[] })),
    fetchBreezyCandidates({ scanMode: "preview" }).catch(() => ({
      ok: false as const,
      candidates: [] as BreezyCandidate[],
    })),
    fetchBreezyCandidates({ scanMode: "fast" }).catch(() => ({
      ok: false as const,
      candidates: [] as BreezyCandidate[],
    })),
  ]);

  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const previewCandidates = previewResult.ok ? previewResult.candidates : [];
  const fastCandidates = fastResult.ok ? fastResult.candidates : [];

  const platformMap = new Map<string, PlatformCandidate>();
  const addToPlatform = (c: BreezyCandidate, source: string) => {
    const existing = platformMap.get(c.candidateId);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return;
    }
    platformMap.set(c.candidateId, { ...c, sources: [source] });
  };
  for (const c of ingestedList) addToPlatform(c, "ingestion_store");
  for (const c of previewCandidates) addToPlatform(c, "preview_scan");
  for (const c of fastCandidates) addToPlatform(c, "fast_scan");
  for (const id of Object.keys(workflowRecords)) {
    const fromPool =
      platformMap.get(id) ??
      ingestedList.find((c) => c.candidateId === id) ??
      previewCandidates.find((c) => c.candidateId === id) ??
      fastCandidates.find((c) => c.candidateId === id);
    if (fromPool) addToPlatform(fromPool, "workflow_linked");
    else {
      addToPlatform(
        {
          candidateId: id,
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          positionId: "",
          positionName: "",
          appliedDate: "",
          addedDate: "",
          stage: "",
          city: "",
          state: "",
        },
        "workflow_only_stub",
      );
    }
  }

  const platformCandidates = [...platformMap.values()];
  const platformIndex = buildPlatformIndex(platformCandidates);

  console.error("[P173] Loading P157 cohort (read-only)…");
  const p157Cohort = await loadDecisionCohort();
  const p157Dashboard = buildDecisionDashboardFromCohort(p157Cohort);
  const p157Ids = new Set(p157Cohort.candidates.map((r) => r.candidateId));
  const p157DecisionById = new Map(
    p157Dashboard.decisions.map((d) => [d.candidateId, d]),
  );

  const ingestionEmailSet = new Set(
    ingestedList.map((c) => normalizeEmail(c.email ?? "")).filter(Boolean),
  );
  const previewEmailSet = new Set(
    previewCandidates.map((c) => normalizeEmail(c.email ?? "")).filter(Boolean),
  );
  const fastEmailSet = new Set(
    fastCandidates.map((c) => normalizeEmail(c.email ?? "")).filter(Boolean),
  );
  const workflowIds = new Set(Object.keys(workflowRecords));

  const storeForSearch = await readStore();

  const candidateAudits: CandidateAuditRow[] = breezyCandidates.map((exportRow) => {
    const email = normalizeEmail(exportRow.email);
    const platform = pickBestPlatformMatch(exportRow, platformIndex);
    const candidateId = platform?.candidateId ?? null;

    const foundInIngestion = email ? ingestionEmailSet.has(email) : false;
    const foundInPreviewScan = email ? previewEmailSet.has(email) : false;
    const foundInFastScan = email ? fastEmailSet.has(email) : false;
    const foundInWorkflow = candidateId ? workflowIds.has(candidateId) : false;
    const foundInSoftwareUnion = Boolean(platform);

    const searchableByName = exportRow.name
      ? searchInPool(ingestedList, exportRow.name) ||
        searchInPool(previewCandidates, exportRow.name) ||
        searchInPool(fastCandidates, exportRow.name)
      : false;
    const searchableByEmail = exportRow.email
      ? searchInPool(ingestedList, exportRow.email) ||
        searchInPool(previewCandidates, exportRow.email) ||
        searchInPool(fastCandidates, exportRow.email)
      : false;
    const searchableByPhone = exportRow.phone
      ? searchInPool(ingestedList, exportRow.phone) ||
        searchInPool(previewCandidates, exportRow.phone) ||
        searchInPool(fastCandidates, exportRow.phone)
      : false;
    const searchableByCandidateId = candidateId
      ? searchInPool(ingestedList, candidateId) ||
        searchInPool(previewCandidates, candidateId) ||
        searchInPool(fastCandidates, candidateId)
      : false;

    const p170StoreHit = exportRow.email
      ? Boolean(findInIngestionStore(storeForSearch, parseP170SearchQuery(exportRow.email)))
      : exportRow.name
        ? Boolean(findInIngestionStore(storeForSearch, parseP170SearchQuery(exportRow.name)))
        : false;

    const searchableP170WouldNeedRescue =
      !p170StoreHit && (searchableByEmail || searchableByName);

    const workflow: CandidateWorkflowRecord | undefined = candidateId
      ? workflowRecords[candidateId]
      : undefined;

    const breezyCandidate: BreezyCandidate | null = platform ?? null;
    const evaluatedByP157 = candidateId ? p157Ids.has(candidateId) : false;
    const p171Record = candidateId ? p171State.candidates[candidateId] : undefined;

    let automationEligible = false;
    let automationBlockers: string[] = [];
    if (breezyCandidate && workflow) {
      const row = buildScoredWorkflowRow(breezyCandidate, workflow, {
        job: publishedJobs.find((j) => j.jobId === breezyCandidate.positionId),
      });
      const onboarding =
        onboardingRecords.find((r) => r.candidateId === breezyCandidate.candidateId) ?? null;
      const hard = detectImmediatePaperworkHardBlockers({
        row,
        candidate: breezyCandidate,
        onboarding,
        auditEvents,
      });
      automationEligible = !hard.blocked;
      automationBlockers = hard.blockers;
    } else if (!breezyCandidate) {
      automationBlockers = ["Not in platform — cannot evaluate P152"];
    } else {
      automationBlockers = ["No workflow record — cannot evaluate P152"];
    }

    const { failurePoint, category } = traceFailurePoint({
      exportRow,
      inPreview: foundInPreviewScan,
      inFast: foundInFastScan,
      inIngestion: foundInIngestion,
      inWorkflow: foundInWorkflow,
      p170Store: p170StoreHit,
      platformMatch: platform,
    });

    return {
      export: exportRow,
      platformCandidateId: candidateId,
      foundInBreezyExport: true,
      foundInIngestion,
      foundInWorkflow,
      foundInPreviewScan,
      foundInFastScan,
      foundInSoftwareUnion,
      searchableByName,
      searchableByEmail,
      searchableByPhone,
      searchableByCandidateId,
      searchableP170StoreOnly: p170StoreHit,
      searchableP170WouldNeedRescue,
      evaluatedByP157,
      inP171Lifecycle: Boolean(p171Record),
      p171LifecycleState: p171Record?.state ?? null,
      workflowStatus: workflow?.workflowStatus ?? null,
      paperworkStatus: workflow?.paperworkStatus ?? null,
      assignedRecruiter: workflow?.assignedRecruiter ?? null,
      automationEligible,
      automationBlockers,
      failurePoint,
      rootCauseCategory: category,
    };
  });

  const missingFromSoftware = candidateAudits.filter((r) => !r.foundInSoftwareUnion);
  const missingFromIngestion = candidateAudits.filter((r) => !r.foundInIngestion);
  const notSearchableP170Store = candidateAudits.filter((r) => !r.searchableP170StoreOnly);
  const notSearchableAny = candidateAudits.filter(
    (r) => !r.searchableByName && !r.searchableByEmail,
  );
  const missingFromDiscovery = candidateAudits.filter(
    (r) => !r.searchableP170StoreOnly && !r.searchableP170WouldNeedRescue,
  );
  const missingFromLifecycle = candidateAudits.filter((r) => !r.inP171Lifecycle);
  const automationBlocked = candidateAudits.filter((r) => !r.automationEligible);
  const notEvaluatedP157 = candidateAudits.filter((r) => !r.evaluatedByP157);

  const exportByPosition = new Map<string, number>();
  for (const c of breezyCandidates) {
    const key = normalizeText(c.positionName);
    exportByPosition.set(key, (exportByPosition.get(key) ?? 0) + 1);
  }

  const positionAudits = breezyPositions.map((bp) => {
    const norm = normalizeText(bp.position);
    const job = matchJobByTitle(publishedJobs, bp.position);
    const exportApplicantCount = exportByPosition.get(norm) ?? 0;
    const softwareApplicantCount = breezyCandidates.filter(
      (c) => normalizeText(c.positionName) === norm && candidateAudits.find((a) => a.export.email === c.email)?.foundInSoftwareUnion,
    ).length;
    const ingestedForPosition = ingestedList.filter(
      (c) => normalizeText(c.positionName ?? "") === norm,
    ).length;

    const countMismatch = bp.applied !== exportApplicantCount;
    const issues: string[] = [];
    if (!job) issues.push("missing_from_breezy_api_jobs");
    if (countMismatch) issues.push("breezy_export_applied_vs_row_count_mismatch");
    if (bp.applied > 0 && ingestedForPosition === 0) issues.push("no_ingested_candidates_for_position");

    return {
      position: bp.position,
      location: bp.location,
      breezyAppliedCount: bp.applied,
      exportRowCount: exportApplicantCount,
      softwareMatchedCount: softwareApplicantCount,
      ingestedCount: ingestedForPosition,
      inBreezyApi: Boolean(job),
      jobId: job?.jobId ?? null,
      jobStatus: job?.status ?? null,
      jobCity: job?.city ?? null,
      jobState: job?.state ?? null,
      feedback: bp.feedback,
      interviewing: bp.interviewing,
      madeOffer: bp.madeOffer,
      hired: bp.hired,
      disqualified: bp.disqualified,
      issues,
    };
  });

  const missingPositions = positionAudits.filter((p) => !p.inBreezyApi);
  const positionCountMismatches = positionAudits.filter((p) =>
    p.issues.includes("breezy_export_applied_vs_row_count_mismatch"),
  );

  const rootCauseCounts: Record<string, number> = {};
  for (const row of candidateAudits) {
    if (!row.rootCauseCategory) continue;
    rootCauseCounts[row.rootCauseCategory] = (rootCauseCounts[row.rootCauseCategory] ?? 0) + 1;
  }

  const top25 = candidateAudits.slice(0, 25).map((row) => ({
    name: row.export.name,
    email: row.export.email,
    appliedAt: row.export.appliedAt,
    position: row.export.positionName,
    recruiter: row.export.recruiter || row.assignedRecruiter,
    platformCandidateId: row.platformCandidateId,
    softwareStatus: row.foundInSoftwareUnion ? "found" : "missing",
    searchStatus: row.searchableP170StoreOnly
      ? "P170 store hit"
      : row.searchableP170WouldNeedRescue
        ? "needs P153.2 rescue"
        : "not searchable",
    lifecycleStatus: row.p171LifecycleState ?? (row.inP171Lifecycle ? "tracked" : "not in P171"),
    paperworkStatus: row.paperworkStatus ?? "unknown",
    workflowStatus: row.workflowStatus,
    evaluatedByP157: row.evaluatedByP157,
    automationEligible: row.automationEligible,
    automationBlockers: row.automationBlockers,
    missing: !row.foundInSoftwareUnion,
    failurePoint: row.failurePoint,
    recommendedFix: !row.foundInIngestion
      ? "Run full ingestion backfill for position; verify ingestion store merges API candidates"
      : !row.foundInWorkflow
        ? "Reconcile workflow store from ingested candidates (P154 backfill)"
        : !row.searchableP170StoreOnly
          ? "Expand ingestion coverage; P170 search is store-first — rescue only on name/email"
          : !row.automationEligible
            ? `Resolve P152 blockers: ${row.automationBlockers.join("; ")}`
            : "No fix required",
    automationPipeline: {
      p170: row.searchableP170StoreOnly || row.searchableP170WouldNeedRescue,
      p157: row.evaluatedByP157,
      p169: row.automationEligible && row.evaluatedByP157,
      p171: row.inP171Lifecycle,
      p152: row.automationEligible,
      blockedReason: row.automationEligible
        ? null
        : row.automationBlockers.join("; ") || row.failurePoint,
    },
  }));

  const mtdExportCount = breezyCandidates.filter((c) =>
    isMtdApplicant({ appliedDate: c.appliedAt.slice(0, 10) }),
  ).length;

  const report = {
    sourcePhase: "P173",
    generatedAt,
    readOnly: true,
    workbook: {
      path: WORKBOOK_PATH,
      sheets: [POSITIONS_SHEET, APPLICANTS_SHEET],
      sheetNotes,
    },
    summary: {
      totalBreezyPositions: breezyPositions.length,
      softwarePositionsPublishedJobs: publishedJobs.length,
      positionDifference: breezyPositions.length - publishedJobs.length,
      totalBreezyCandidates: breezyCandidates.length,
      breezyExportMtdCandidates: mtdExportCount,
      softwareCandidatesUnion: platformCandidates.length,
      softwareIngestionCandidates: ingestedList.length,
      softwareWorkflowRecords: Object.keys(workflowRecords).length,
      softwarePreviewScanCandidates: previewCandidates.length,
      softwareFastScanCandidates: fastCandidates.length,
      candidateDifference: breezyCandidates.length - platformCandidates.length,
      candidatesMissingFromSoftwareUnion: missingFromSoftware.length,
      positionsMissingFromBreezyApi: missingPositions.length,
      candidatesNotSearchableP170Store: notSearchableP170Store.length,
      candidatesNotSearchableByNameOrEmail: notSearchableAny.length,
      candidatesMissingFromIngestion: missingFromIngestion.length,
      candidatesMissingFromDiscovery: missingFromDiscovery.length,
      candidatesMissingFromP171Lifecycle: missingFromLifecycle.length,
      candidatesNotEvaluatedByP157: notEvaluatedP157.length,
      automationBlocked: automationBlocked.length,
      ingestionStore: {
        candidates: ingestedList.length,
        scannedPositions: ingestionStore.scannedPositionIds.length,
        publishedPositionsTotal: ingestionStore.publishedPositionsTotal,
        cycleComplete: ingestionStore.cycleComplete,
        updatedAt: ingestionStore.updatedAt,
      },
      p157CohortSize: p157Cohort.candidates.length,
      p171TrackedCandidates: Object.keys(p171State.candidates).length,
    },
    rootCauseCounts,
    top25NewestCandidates: top25,
    newestMissingCandidates: missingFromSoftware.slice(0, 25).map((r) => ({
      name: r.export.name,
      email: r.export.email,
      appliedAt: r.export.appliedAt,
      position: r.export.positionName,
      failurePoint: r.failurePoint,
      category: r.rootCauseCategory,
    })),
    newestSearchFailures: notSearchableAny.slice(0, 25).map((r) => ({
      name: r.export.name,
      email: r.export.email,
      appliedAt: r.export.appliedAt,
      failurePoint: r.failurePoint,
      p170Store: r.searchableP170StoreOnly,
      wouldNeedRescue: r.searchableP170WouldNeedRescue,
    })),
    newestAutomationFailures: automationBlocked.slice(0, 25).map((r) => ({
      name: r.export.name,
      appliedAt: r.export.appliedAt,
      blockers: r.automationBlockers,
      failurePoint: r.failurePoint,
    })),
    positionMismatches: positionAudits.filter((p) => p.issues.length > 0).slice(0, 50),
    missingPositions: missingPositions.slice(0, 50),
    candidateAudits,
    answers: {
      everyPositionInSoftware: missingPositions.length === 0,
      everyCandidateInSoftware: missingFromSoftware.length === 0,
      newestImmediatelyDiscoverable: top25.every((c) => c.automationPipeline.p170),
      newestSearchable: top25.every(
        (c) => c.searchStatus === "P170 store hit" || c.searchStatus === "needs P153.2 rescue",
      ),
      newestEvaluated: top25.every((c) => c.evaluatedByP157),
      newestAutomationWhenQualified: top25.filter((c) => c.automationEligible).length,
    },
    recommendedFixes: [
      "Run P154 full candidate backfill / ingestion sync until ingestion store covers all published positions (currently ~6 candidates vs 367 export).",
      "P170 search is ingestion-store-first; candidates only in preview/fast scan require P153.2 rescue (name/email) — phone/ID search fails without store hydration.",
      "P157 decision cohort uses filterMtdCandidates on ingestion store only — non-MTD or non-ingested candidates are never evaluated.",
      "P171 lifecycle only tracks candidates after lifecycle cycles — empty store means no lifecycle parity until orchestrator runs.",
      "Position applicant counts in export should be reconciled job-by-job after ingestion catches up.",
    ],
  };

  const md = formatMarkdown(report);
  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const jsonPath = path.join(artifactDir, "breezy-validation-report.json");
  const mdPath = path.join(artifactDir, "breezy-validation-report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, md, "utf8");

  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, summary: report.summary, answers: report.answers }, null, 2));
}

function formatMarkdown(report: Record<string, unknown>): string {
  const s = report.summary as Record<string, number>;
  const answers = report.answers as Record<string, boolean | number>;
  const fixes = report.recommendedFixes as string[];
  const top25 = report.top25NewestCandidates as Array<Record<string, unknown>>;
  const rootCauses = report.rootCauseCounts as Record<string, number>;

  const lines = [
    "# P173 — Breezy Production Data Validation & Parity Audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "Source of truth: `diagnostics/Breezy Info.xlsx`",
    "",
    "## Summary",
    "",
    "| Metric | Breezy Export | Software | Difference |",
    "|--------|---------------|----------|------------|",
    `| Positions | ${s.totalBreezyPositions} | ${s.softwarePositionsPublishedJobs} (API published) | ${s.positionDifference} |`,
    `| Candidates | ${s.totalBreezyCandidates} | ${s.softwareCandidatesUnion} (union) | ${s.candidateDifference} |`,
    `| Ingestion store | — | ${s.softwareIngestionCandidates} | — |`,
    `| Workflow records | — | ${s.softwareWorkflowRecords} | — |`,
    `| Preview scan pool | — | ${s.softwarePreviewScanCandidates} | — |`,
    `| Fast scan pool | — | ${s.softwareFastScanCandidates} | — |`,
    "",
    "| Issue | Count |",
    "|-------|-------|",
    `| Candidates missing from software | ${s.candidatesMissingFromSoftwareUnion} |`,
    `| Positions missing from Breezy API | ${s.positionsMissingFromBreezyApi} |`,
    `| Not searchable (P170 store) | ${s.candidatesNotSearchableP170Store} |`,
    `| Missing from ingestion | ${s.candidatesMissingFromIngestion} |`,
    `| Missing from discovery | ${s.candidatesMissingFromDiscovery} |`,
    `| Not in P171 lifecycle | ${s.candidatesMissingFromP171Lifecycle} |`,
    `| Not evaluated by P157 | ${s.candidatesNotEvaluatedByP157} |`,
    `| Automation blocked | ${s.automationBlocked} |`,
    "",
    "## Success criteria",
    "",
    `1. Every Breezy position in software? **${answers.everyPositionInSoftware ? "YES" : "NO"}**`,
    `2. Every Breezy candidate in software? **${answers.everyCandidateInSoftware ? "YES" : "NO"}**`,
    `3. Newest immediately discoverable? **${answers.newestImmediatelyDiscoverable ? "YES" : "NO"}**`,
    `4. Newest searchable? **${answers.newestSearchable ? "YES" : "NO"}**`,
    `5. Newest evaluated by P157? **${answers.newestEvaluated ? "YES" : "NO"}**`,
    `6. Newest qualified for automation: **${answers.newestAutomationWhenQualified} / 25**`,
    "",
    "## Root cause categories",
    "",
    ...Object.entries(rootCauses).map(([k, v]) => `- **${k}**: ${v}`),
    "",
    "## Top 25 newest candidates",
    "",
    "| Applied | Name | Position | Software | Search | P157 | P152 | Missing? |",
    "|---------|------|----------|----------|--------|------|------|----------|",
    ...top25.map((r) =>
      `| ${r.appliedAt} | ${r.name} | ${String(r.position).slice(0, 40)}… | ${r.softwareStatus} | ${r.searchStatus} | ${r.evaluatedByP157 ? "yes" : "no"} | ${r.automationEligible ? "eligible" : "blocked"} | ${r.missing ? "yes" : "no"} |`,
    ),
    "",
    "## Recommended fixes",
    "",
    ...fixes.map((f) => `- ${f}`),
    "",
    "Full per-candidate audit: `artifacts/breezy-validation-report.json`",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
