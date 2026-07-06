"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import { fetchMelProjectsData, fetchRecruitingSheetData } from "@/lib/dashboard-api-client";
import { fetchRecruitingLiveSnapshot } from "@/lib/cached-recruiting-live-client";
import { isGoogleSheetRecruitingLiveEnabledClient } from "@/lib/recruiting-data-architecture";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import {
  analyzeMarketIdentityQuality,
  type MarketIdentityDiagnostics,
} from "@/lib/market-identity";
import type { Kpi } from "@/lib/recruiting-sample-data";
import {
  computeRecruitingIntelligence,
  intelligenceSnapshotToKpis,
  RISK_BADGE_STYLES,
  type IntelligenceOpenPost,
} from "@/lib/recruiting-intelligence";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { DeferredSection } from "@/components/ui/deferred-section";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CandidateIntelligenceSection } from "./candidate-intelligence-section";
import { CandidateAdvancementIntelligencePanel } from "@/components/executive/candidate-advancement-intelligence-panel";
import { PaperworkApprovalQueuePanel } from "@/components/executive/paperwork-approval-queue-panel";
import { AutoSendPaperworkReminderPanel } from "@/components/executive/auto-send-paperwork-reminder-panel";
import { ControlledPaperworkAutomationPanel } from "@/components/executive/controlled-paperwork-automation-panel";
import { CriticalMarketsQueueSection } from "./critical-markets-queue-section";
import { DemandIntelligenceSection } from "./demand-intelligence-section";
import { ForecastIntelligenceSection } from "./forecast-intelligence-section";
import { LiveMarketIntelligenceSection } from "./live-market-intelligence-section";
import { MarketIntelligenceSection } from "./market-intelligence-section";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { KpiCards } from "./kpi-cards";
import { OpportunityAutomationSection } from "./opportunity-automation-section";
import { RecruitingActionCenterSection } from "./recruiting-action-center-section";

function formatDaysOpen(days: number | null): string {
  if (days === null) return "—";
  return `${days}d`;
}

type IntelligenceLoadPhase = "loading" | "ready" | "error";

const APLUS_TABLE_INITIAL = 25;

function APlusOpportunityTable({ rows }: { rows: IntelligenceOpenPost[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, APLUS_TABLE_INITIAL);

  return (
    <section
      aria-labelledby="aplus-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <h2 id="aplus-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          A+ Opportunity queue
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Prioritized open posts: zero applicants, open over 7 days, high location footprint (same
          title), and rural states.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">
          No A+ opportunities match the current criteria on open posts.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Score</th>
                <th className="px-4 py-3 font-medium sm:px-5">Risk</th>
                <th className="px-4 py-3 font-medium sm:px-5">Job title</th>
                <th className="px-4 py-3 font-medium sm:px-5">Location</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell sm:px-5">DM</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Apps</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Days</th>
                <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
                  Stores
                </th>
                <th className="hidden px-4 py-3 font-medium text-right sm:table-cell sm:px-5">
                  Openings
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {visible.map((row, index) => (
                <tr key={`${row.jobTitle}-${row.city}-${row.state}-${index}`} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-semibold tabular-nums text-teal-300 sm:px-5">
                    {row.aPlusScore}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        RISK_BADGE_STYLES[row.riskLevel],
                      ].join(" ")}
                    >
                      {row.riskLevel}
                    </span>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 font-medium text-zinc-100 sm:max-w-xs sm:px-5">
                    <span className="line-clamp-2">{row.jobTitle}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">
                    {row.city}, {row.state}
                    {row.isRural ? (
                      <span className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                        Rural
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-400 md:table-cell sm:px-5">{row.manager}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                    {row.applicantCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400 sm:px-5">
                    {formatDaysOpen(row.daysOpen)}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-400 lg:table-cell sm:px-5">
                    {row.storeCount}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-400 sm:table-cell sm:px-5">
                    {row.openings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > APLUS_TABLE_INITIAL ? (
            <div className="border-t border-zinc-800/80 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs font-medium text-teal-300 hover:text-teal-200"
              >
                {showAll
                  ? "Show fewer rows"
                  : `Show all ${rows.length} opportunities (${rows.length - APLUS_TABLE_INITIAL} more)`}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function RecruitingIntelligenceSection() {
  const sheetLive = isGoogleSheetRecruitingLiveEnabledClient();
  const [data, setData] = useState<SheetDataResult | null>(null);
  const [melData, setMelData] = useState<MelProjectsDataResult | null>(null);
  const [breezyIntelligence, setBreezyIntelligence] = useState<RecruitingIntelligenceSnapshot | null>(
    null,
  );
  const [phase, setPhase] = useState<IntelligenceLoadPhase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const loadingCeilingHit = useLoadingCeiling(phase === "loading");

  const loadBundle = useCallback(async () => {
    const route = "/recruiting-intelligence";
    const started = performance.now();
    logDashboardFetch("start", { route, label: "intelligence-bundle" });
    setPhase("loading");
    setLoadError(null);

    try {
      if (!sheetLive) {
        const [melResult, liveResult] = await Promise.allSettled([
          fetchMelProjectsData(),
          fetchRecruitingLiveSnapshot(false),
        ]);

        const melParsed =
          melResult.status === "fulfilled"
            ? melResult.value
            : {
                ok: false as const,
                error:
                  melResult.reason instanceof Error
                    ? melResult.reason.message
                    : "MEL projects unavailable",
                fetchedAt: new Date().toISOString(),
                csvUrl: "",
              };

        setMelData(melParsed);
        setData({ ok: true, rows: [], headers: [], fetchedAt: new Date().toISOString(), csvUrl: "" });

        if (liveResult.status === "fulfilled") {
          const live = liveResult.value;
          if (live.ok && live.intelligence) {
            setBreezyIntelligence(live.intelligence);
            setPhase("ready");
            logDashboardFetch(live.partial ? "partial" : "success", {
              route,
              label: "intelligence-bundle",
              ms: Math.round(performance.now() - started),
              partial: Boolean(live.partial),
            });
            return;
          }
          const message = live.ok
            ? "Breezy live snapshot returned no intelligence payload."
            : live.error;
          setBreezyIntelligence(null);
          setLoadError(message);
          setPhase("error");
          logDashboardFetch("error", { route, label: "intelligence-bundle", ms: Math.round(performance.now() - started), error: message });
          return;
        }

        const message =
          liveResult.reason instanceof Error
            ? liveResult.reason.message
            : "Failed to load Breezy live snapshot";
        setBreezyIntelligence(null);
        setLoadError(message);
        setPhase("error");
        logDashboardFetch("error", { route, label: "intelligence-bundle", ms: Math.round(performance.now() - started), error: message });
        return;
      }

      const [sheetResult, melResult] = await Promise.allSettled([
        fetchRecruitingSheetData(),
        fetchMelProjectsData(),
      ]);

      const parsed =
        sheetResult.status === "fulfilled"
          ? sheetResult.value
          : {
              ok: false as const,
              error:
                sheetResult.reason instanceof Error
                  ? sheetResult.reason.message
                  : "Recruiting sheet unavailable",
              fetchedAt: new Date().toISOString(),
              csvUrl: "",
            };
      const melParsed =
        melResult.status === "fulfilled"
          ? melResult.value
          : {
              ok: false as const,
              error:
                melResult.reason instanceof Error
                  ? melResult.reason.message
                  : "MEL projects unavailable",
              fetchedAt: new Date().toISOString(),
              csvUrl: "",
            };

      setData(parsed);
      setMelData(melParsed);
      setBreezyIntelligence(null);

      if (!parsed.ok) {
        setLoadError(parsed.error);
        setPhase("error");
        logDashboardFetch("error", { route, label: "intelligence-bundle", ms: Math.round(performance.now() - started), error: parsed.error });
        return;
      }

      setPhase("ready");
      logDashboardFetch("success", { route, label: "intelligence-bundle", ms: Math.round(performance.now() - started) });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load recruiting intelligence";
      setLoadError(message);
      setPhase("error");
      logDashboardFetch("error", { route, label: "intelligence-bundle", error: message });
    }
  }, [sheetLive]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadBundle(), 0);
    return () => window.clearTimeout(id);
  }, [loadBundle]);

  const retry = useCallback(() => {
    setRetrying(true);
    void loadBundle().finally(() => setRetrying(false));
  }, [loadBundle]);

  const snapshot = useMemo(() => {
    if (!sheetLive && breezyIntelligence) return breezyIntelligence;
    if (!data?.ok) return null;
    return computeRecruitingIntelligence(data.rows, data.headers);
  }, [sheetLive, breezyIntelligence, data]);

  const kpiItems = useMemo(() => {
    if (!data) return [];
    if (!data.ok) return intelligenceSnapshotToKpis(emptySnapshot(), data.error);
    if (!snapshot) return [];
    return intelligenceSnapshotToKpis(snapshot);
  }, [data, snapshot]);

  const dataQualityDiagnostics = useMemo<MarketIdentityDiagnostics | null>(() => {
    if (!data?.ok || !melData?.ok) return null;
    return analyzeMarketIdentityQuality({
      recruitingRows: data.rows,
      recruitingHeaders: data.headers,
      melRows: melData.rows,
      melHeaders: melData.headers,
    });
  }, [data, melData]);

  const dataQualityKpis = useMemo<Kpi[]>(() => {
    if (!dataQualityDiagnostics) return [];
    return [
      {
        id: "matched-market-pct",
        label: "Matched market %",
        value: `${dataQualityDiagnostics.matchedMarketPercent}%`,
        change: "Identity",
        changeDirection: "flat",
        hint: `${dataQualityDiagnostics.matchedRows.toLocaleString()} of ${dataQualityDiagnostics.totalRows.toLocaleString()} rows have complete matched market identity`,
      },
      {
        id: "unmatched-rows",
        label: "Unmatched rows",
        value: dataQualityDiagnostics.unmatchedRows.toLocaleString(),
        change: "Quality",
        changeDirection: dataQualityDiagnostics.unmatchedRows > 0 ? "down" : "flat",
        hint: `${dataQualityDiagnostics.rowsMissingCityState.toLocaleString()} missing city/state · ${dataQualityDiagnostics.malformedRows.toLocaleString()} malformed`,
      },
      {
        id: "duplicate-markets",
        label: "Duplicate market count",
        value: dataQualityDiagnostics.duplicateMarketCount.toLocaleString(),
        change: "Normalized",
        changeDirection: "flat",
        hint: `${dataQualityDiagnostics.duplicateAliases.length.toLocaleString()} alias conflicts detected`,
      },
      {
        id: "identity-confidence",
        label: "Avg identity confidence",
        value: `${dataQualityDiagnostics.averageConfidence}%`,
        change: `${dataQualityDiagnostics.autoFixableRows.toLocaleString()} auto-fixable`,
        changeDirection: "flat",
        hint: `${dataQualityDiagnostics.confidenceBuckets.high.toLocaleString()} high · ${dataQualityDiagnostics.confidenceBuckets.medium.toLocaleString()} medium · ${dataQualityDiagnostics.confidenceBuckets.low.toLocaleString()} low confidence`,
      },
    ];
  }, [dataQualityDiagnostics]);

  const archiveSheetData: SheetDataResult =
    data ??
    ({
      ok: false,
      error: "Recruiting sheet not loaded",
      fetchedAt: new Date().toISOString(),
      csvUrl: "",
    } as SheetDataResult);
  const archiveMelData: MelProjectsDataResult =
    melData ??
    ({
      ok: false,
      error: "MEL sheet not loaded",
      fetchedAt: new Date().toISOString(),
      csvUrl: "",
    } as MelProjectsDataResult);

  if (phase === "loading" || phase === "error" || !snapshot) {
    const timedOut = loadingCeilingHit || Boolean(loadError?.toLowerCase().includes("timed out"));
    return (
      <DashboardSectionFallback
        title="Recruiting intelligence"
        loadingMessage="Loading recruiting intelligence (Breezy + MEL)…"
        isLoading={phase === "loading"}
        loadingCeilingHit={loadingCeilingHit}
        error={phase === "error" || !snapshot ? loadError ?? "No intelligence data available." : null}
        timedOut={timedOut}
        onRetry={retry}
        retrying={retrying}
        skeletonRows={4}
        skeletonCards={6}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Recruiting intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          {sheetLive
            ? "Legacy mode: recruiting Google Sheet drives open-post analytics."
            : "Summary KPIs and charts use Breezy HR (published jobs + candidate sync). MEL sheet powers store-call demand. Sheet-backed sections below need archive rows or legacy mode."}
        </p>
      </div>

      <KpiCards
        items={kpiItems}
        gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      />

      {dataQualityKpis.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Data quality</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Market identity diagnostics across recruiting and MEL sources.
            </p>
          </div>
          <KpiCards
            items={dataQualityKpis}
            gridClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          />
          {dataQualityDiagnostics ? (
            <>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                  <p className="font-medium text-zinc-300">Unmatched markets</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {dataQualityDiagnostics.unmatchedMarkets.slice(0, 5).join(", ") || "None"}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                  <p className="font-medium text-zinc-300">Unmatched DMs</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {dataQualityDiagnostics.unmatchedDms.slice(0, 5).join(", ") || "None"}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                  <p className="font-medium text-zinc-300">Malformed / missing rows</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {dataQualityDiagnostics.rowsMissingCityState.toLocaleString()} missing city/state ·{" "}
                    {dataQualityDiagnostics.malformedRows.toLocaleString()} malformed ·{" "}
                    {dataQualityDiagnostics.autoFixableRows.toLocaleString()} auto-fixable
                  </p>
                </div>
              </div>
            {dataQualityDiagnostics.topUnmatchedMarkets.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40">
                <div className="border-b border-zinc-800/80 px-4 py-3">
                  <h3 className="font-medium text-zinc-300">Top unmatched markets after normalization</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Canonical keys use CITY_STATE format, for example SHREVEPORT_LA.
                  </p>
                </div>
                <table className="min-w-[620px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-3 font-medium">Market</th>
                      <th className="px-4 py-3 font-medium">Canonical key</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 text-right font-medium">Confidence</th>
                      <th className="px-4 py-3 font-medium">Issues</th>
                      <th className="px-4 py-3 text-right font-medium">Rows</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {dataQualityDiagnostics.topUnmatchedMarkets.map((market) => (
                      <tr key={`${market.source}-${market.normalizedKey}`} className="hover:bg-zinc-800/30">
                        <td className="px-4 py-3 text-zinc-200">{market.market}</td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                          {market.normalizedKey}
                        </td>
                        <td className="px-4 py-3 capitalize text-zinc-400">{market.source}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                          {market.avgConfidence}%
                        </td>
                        <td className="px-4 py-3 text-zinc-400">
                          {market.issueTypes.join(", ") || "Unmatched"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                          {market.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <IntelligenceBarChart
          title="Applicants by state"
          subtitle="Total applicants on open posts"
          data={snapshot.applicantsByState}
          valueLabel="applicants"
          barClassName="bg-sky-500/80"
        />
        <IntelligenceBarChart
          title="Openings by DM"
          subtitle="Open post count by hiring manager"
          data={snapshot.openingsByManager}
          valueLabel="openings"
          barClassName="bg-teal-500/80"
        />
        <IntelligenceBarChart
          title="Zero applicant trend"
          subtitle="Zero-applicant posts by week opened"
          data={snapshot.zeroApplicantTrend}
          valueLabel="posts"
          barClassName="bg-rose-500/70"
        />
      </div>

      <DeferredSection
        title="A+ Opportunity queue"
        description="Prioritized open posts — expand for full table."
        summary={
          <p className="text-sm text-zinc-500">
            {snapshot.aPlusOpportunities.length} prioritized opportunities ready to review.
          </p>
        }
      >
        <APlusOpportunityTable rows={snapshot.aPlusOpportunities} />
      </DeferredSection>

      {!sheetLive && archiveSheetData.ok && archiveSheetData.rows.length === 0 ? (
        <div
          role="note"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <p className="font-medium text-amber-50">Sheet-backed sections (archive)</p>
          <p className="mt-1 text-amber-100/90">
            Critical markets, opportunity automation, forecast, and related panels read from the
            recruiting Google Sheet. With Breezy as the live source, those rows are not loaded here —
            expand sections only for archive reconciliation, or enable legacy sheet-live mode for comparison.
            Candidate intelligence below uses live Breezy data.
          </p>
        </div>
      ) : null}

      <DeferredSection
        title="Critical markets queue"
        summary={<p className="text-sm text-zinc-500">Market-level recruiting priorities.</p>}
      >
        <CriticalMarketsQueueSection recruiting={archiveSheetData} mel={archiveMelData} />
      </DeferredSection>

      <DeferredSection
        title="Market intelligence (sheet + MEL)"
        summary={<p className="text-sm text-zinc-500">Market demand and coverage from sheet + MEL rows.</p>}
      >
        <LiveMarketIntelligenceSection recruiting={archiveSheetData} mel={archiveMelData} />
      </DeferredSection>

      <DeferredSection
        title="Opportunity automation"
        summary={<p className="text-sm text-zinc-500">Automated opportunity scoring and routing.</p>}
      >
        <OpportunityAutomationSection recruiting={archiveSheetData} mel={archiveMelData} />
      </DeferredSection>

      <DeferredSection
        title="Recruiting action center"
        summary={<p className="text-sm text-zinc-500">Workflow queues and recruiter assignments.</p>}
        skeletonRows={5}
      >
        <RecruitingActionCenterSection recruiting={archiveSheetData} mel={archiveMelData} />
      </DeferredSection>

      <DeferredSection
        title="Forecast intelligence"
        summary={<p className="text-sm text-zinc-500">Staffing forecast and project risk projections.</p>}
      >
        <ForecastIntelligenceSection recruiting={archiveSheetData} mel={archiveMelData} />
      </DeferredSection>

      <DeferredSection
        title="Candidate intelligence"
        summary={<p className="text-sm text-zinc-500">Candidate scoring and fit analysis.</p>}
      >
        <CandidateIntelligenceSection />
      </DeferredSection>

      <DeferredSection
        title="Candidate advancement intelligence"
        summary={
          <p className="text-sm text-zinc-500">
            P144 read-only advancement scores, hire probability, and automation preview.
          </p>
        }
      >
        <CandidateAdvancementIntelligencePanel />
      </DeferredSection>

      <DeferredSection
        title="Controlled paperwork automation"
        summary={
          <p className="text-sm text-zinc-500">
            P145 paperwork queue with recruiter approval — no automatic sends.
          </p>
        }
      >
        <ControlledPaperworkAutomationPanel />
        <div className="mt-6">
          <PaperworkApprovalQueuePanel />
        </div>
        <div className="mt-6">
          <AutoSendPaperworkReminderPanel />
        </div>
      </DeferredSection>

      <DeferredSection
        title="Market intelligence"
        summary={<p className="text-sm text-zinc-500">Territory market health and demand curves.</p>}
      >
        <MarketIntelligenceSection recruiting={archiveSheetData} mel={archiveMelData} />
      </DeferredSection>

      <DeferredSection
        title="Demand intelligence"
        summary={<p className="text-sm text-zinc-500">MEL demand vs recruiting supply by state.</p>}
      >
        <DemandIntelligenceSection recruiting={archiveSheetData} mel={archiveMelData} />
      </DeferredSection>
    </div>
  );
}

function emptySnapshot() {
  return computeRecruitingIntelligence([], []);
}
