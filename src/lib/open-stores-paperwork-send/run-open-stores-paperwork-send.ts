import { fetchBreezyJobs } from "@/lib/breezy-api";
import { runAutonomousRecruitingCycle } from "@/lib/autonomous-recruiting-pipeline";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import {
  buildApplicantTrackingList,
  tallyApplicantTracking,
} from "@/lib/open-stores-paperwork-send/build-applicant-tracking";
import {
  FORCE_AUTO_ADVANCE_WARNING,
  assertForceAutoAdvanceAllowed,
} from "@/lib/open-stores-paperwork-send/force-auto-advance";
import {
  assertLivePilotEnvForExecute,
  ensurePilotMaxSendsForCanary,
  inspectLivePilotEnv,
} from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import {
  buildApplicantsPerStore,
  buildReportTotals,
  buildTopStoresByApplicants,
} from "@/lib/open-stores-paperwork-send/format-report";
import {
  attachLivePositionIds,
  matchOpensToBreezyPosts,
  sortOpensByApplicantCount,
  uniqueMatchedPositionIds,
} from "@/lib/open-stores-paperwork-send/match-opens-to-breezy";
import {
  loadTrendsWorkbook,
  opensWithApplicants,
} from "@/lib/open-stores-paperwork-send/parse-workbook";
import type {
  OpenStoresPaperworkSendOptions,
  OpenStoresPaperworkSendReport,
} from "@/lib/open-stores-paperwork-send/types";

type CycleReport = NonNullable<OpenStoresPaperworkSendReport["cycle"]>;

const DEFAULT_CANARY_LIMIT = 5;

async function loadEmailLookup(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const store = await readIngestionStore();
    for (const c of listIngestedCandidates(store)) {
      const email = String(c.email ?? "").trim();
      if (email) map.set(c.candidateId, email);
    }
  } catch {
    /* optional enrichment */
  }
  return map;
}

/**
 * Send paperwork to qualified applicants for open stores listed in the Trends workbook.
 *
 * Safety (mirrors P243):
 * - dryRun default true
 * - live requires confirmLive
 * - canaryLimit caps live auto_advance sends (default 5)
 * - forceAutoAdvance requires live+confirmLive and still respects canary/idempotency/already-sent
 * - Dropbox testMode / never-double-send enforced inside runAutonomousRecruitingCycle
 */
export async function runOpenStoresPaperworkSend(
  options: OpenStoresPaperworkSendOptions,
): Promise<OpenStoresPaperworkSendReport> {
  const dryRunRequested = options.dryRun !== false;
  const confirmLive = options.confirmLive === true;
  const forceAutoAdvance = options.forceAutoAdvance === true;
  const canaryLimit = Math.max(1, Math.min(options.canaryLimit ?? DEFAULT_CANARY_LIMIT, 25));
  const forceFreshReset = options.forceFreshReset === true;
  const notes: string[] = [];
  const warnings: string[] = [];

  assertForceAutoAdvanceAllowed({
    forceAutoAdvance,
    dryRun: dryRunRequested,
    confirmLive,
  });

  if (forceAutoAdvance) {
    warnings.push(FORCE_AUTO_ADVANCE_WARNING);
    notes.push(FORCE_AUTO_ADVANCE_WARNING);
  }

  let dryRun = dryRunRequested;
  let mode: OpenStoresPaperworkSendReport["mode"] = "dry_run";
  const confirmationPhrase = options.confirmationPhrase?.trim() || undefined;

  if (!dryRunRequested && !confirmLive) {
    dryRun = true;
    mode = "blocked_fallback_dry_run";
    warnings.push("Live blocked: --confirm-live required. Falling back to dry-run.");
  } else if (!dryRunRequested && confirmLive) {
    mode = "canary_live";
    // Fail early with exact export block before any Breezy/P243 work.
    const envStatus = assertLivePilotEnvForExecute();
    notes.push(
      `Pilot env OK: LIVE_PILOT_ENABLED=${envStatus.present.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED} ` +
        `LIVE_MODE=${envStatus.present.AUTONOMOUS_PAPERWORK_LIVE_MODE} ` +
        `OPERATOR_GO=${envStatus.present.AUTONOMOUS_PAPERWORK_OPERATOR_GO}`,
    );
    if (!confirmationPhrase) {
      throw new Error(
        `Live paperwork blocked: confirmationPhrase missing. ` +
          `Pass --confirm "SEND 1 PAPERWORK PACKET" or use --live --confirm-live (auto-injects the phrase).`,
      );
    }
    notes.push(`P122 confirmationPhrase applied for live execute.`);
    const registry = await loadPilotSendRegistry();
    const maxSends = ensurePilotMaxSendsForCanary(registry.sendCount + canaryLimit);
    notes.push(maxSends.message);
  } else {
    const envStatus = inspectLivePilotEnv();
    notes.push(
      envStatus.ok
        ? "Pilot env present (dry-run; not required)."
        : `Pilot env not set (ok for dry-run): ${envStatus.missing.join(", ")}`,
    );
  }

  const { opens, breezyPosts } = loadTrendsWorkbook(options.xlsxPath);
  let applicantOpens = sortOpensByApplicantCount(opensWithApplicants(opens));
  notes.push(
    `Workbook loaded: ${applicantOpens.length}/${opens.length} Opens with Applicant=Yes; ${breezyPosts.length} Breezy Posts rows.`,
  );
  notes.push("Processing order: highest sheet applicant count first.");

  if (options.limit && options.limit > 0) {
    applicantOpens = applicantOpens.slice(0, options.limit);
    notes.push(
      `Applied --limit=${options.limit} after ranking by applicant count (top ${applicantOpens.length} stores).`,
    );
  }

  let matches = matchOpensToBreezyPosts({ opens: applicantOpens, breezyPosts });

  if (!options.sheetOnly) {
    const jobsResult = await fetchBreezyJobs("published");
    if (!jobsResult.ok) {
      warnings.push(
        `fetchBreezyJobs failed (${jobsResult.error ?? "unknown"}) — cycle will run without position filter if any sheet-only IDs exist.`,
      );
    } else {
      matches = attachLivePositionIds(matches, jobsResult.jobs);
      notes.push(`Resolved live published jobs: ${jobsResult.jobs.length}.`);
    }
  } else {
    notes.push("sheetOnly=true — skipped live Breezy job resolution and P243 cycle.");
  }

  const positionIds = uniqueMatchedPositionIds(matches);
  const matchedOpens = matches.filter((m) => m.breezyPost && m.confidence !== "ambiguous").length;
  const unmatchedOpens = matches.filter((m) => m.confidence === "unmatched").length;
  const ambiguousOpens = matches.filter((m) => m.confidence === "ambiguous").length;

  let cycle = null as OpenStoresPaperworkSendReport["cycle"];

  if (!options.sheetOnly && positionIds.length > 0) {
    const sheetApplicantTotal = matches.reduce(
      (n, m) =>
        n + Math.max(m.open.applicantCount || 0, m.breezyPost?.candidates || 0),
      0,
    );
    const pullLimit = Math.max(
      1,
      Math.min(Math.max(sheetApplicantTotal, positionIds.length * 5, 10), 100),
    );

    cycle = await runAutonomousRecruitingCycle({
      dryRun,
      confirmLive: !dryRun && confirmLive,
      canaryLimit,
      fullLive: false,
      limit: pullLimit,
      positionIds,
      forceFreshReset,
      forceAutoAdvance: forceAutoAdvance && !dryRun && confirmLive,
      useLLMEnhancement: options.useLLMEnhancement === true,
      respectIdempotency: true,
      confirmationPhrase,
    });

    if (!dryRunRequested && cycle.dryRun) {
      mode = "blocked_fallback_dry_run";
      warnings.push(
        "P243 cycle stayed in dry-run (preflight/confirmLive). No live paperwork was sent.",
      );
    } else if (!cycle.dryRun) {
      mode = "canary_live";
    }

    notes.push(...cycle.notes.slice(0, 12));
    warnings.push(...cycle.warnings);
  } else if (!options.sheetOnly) {
    warnings.push("No live positionIds resolved — skipped P243 autonomous cycle.");
  }

  const emailByCandidateId = cycle ? await loadEmailLookup() : new Map<string, string>();
  const applicants = buildApplicantTrackingList({
    matches,
    cycle,
    emailByCandidateId,
  });
  const applicantTally = tallyApplicantTracking(applicants);

  const applicantsPerStore = buildApplicantsPerStore({ matches, cycle });
  const topStoresByApplicants = buildTopStoresByApplicants(applicantsPerStore, 5);
  const totals = buildReportTotals({
    matches,
    applicantsPerStore,
    cycle,
    canaryLimit,
    dryRun: cycle ? cycle.dryRun : dryRun,
  });
  const failures = buildFailureRows(matches, cycle);

  const forcedAutoAdvanceCount =
    cycle?.forcedAutoAdvanceCount ?? applicantTally.forcedAutoAdvance;

  if (applicants.length) {
    notes.push(
      `Applicant tracking: planned=${applicantTally.planned} sent=${applicantTally.sent} skipped=${applicantTally.skipped} qualifiedAdvanced=${applicantTally.qualifiedAdvanced} forced=${applicantTally.forcedAutoAdvance}`,
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    xlsxPath: options.xlsxPath,
    mode,
    dryRun: cycle ? cycle.dryRun : dryRun,
    confirmLive,
    canaryLimit,
    forceFreshReset,
    forceAutoAdvance,
    forcedAutoAdvanceCount,
    opensWithApplicants: applicantOpens.length,
    totalSheetApplicants: totals.totalSheetApplicants,
    totalQualifiedApplicants: totals.totalQualifiedApplicants,
    estimatedPaperworkSends: totals.estimatedPaperworkSends,
    topStoresByApplicants,
    matchedOpens,
    unmatchedOpens,
    ambiguousOpens,
    uniquePositionIds: positionIds.length,
    positionIds,
    applicantsPerStore,
    applicants,
    applicantTally,
    totalPaperworkPlanned: cycle?.paperworkPlanned ?? 0,
    totalPaperworkSent: cycle?.paperworkSent ?? 0,
    totalFailures: cycle?.failures ?? failures.length,
    failures,
    cycle,
    notes,
    warnings,
  };
}

function buildFailureRows(
  matches: ReturnType<typeof matchOpensToBreezyPosts>,
  cycle: CycleReport | null,
): OpenStoresPaperworkSendReport["failures"] {
  if (!cycle) return [];
  return cycle.failuresDetail.map((f) => {
    const positionId =
      cycle.candidates.find((c) => c.candidateId === f.candidateId)?.positionId ?? null;
    const match = matches.find((m) => m.positionId && m.positionId === positionId);
    return {
      candidateId: f.candidateId,
      error: f.error,
      storeHint: match ? `${match.open.city}, ${match.open.state}` : undefined,
    };
  });
}
