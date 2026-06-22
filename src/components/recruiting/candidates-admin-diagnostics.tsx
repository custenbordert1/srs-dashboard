"use client";

import { useState } from "react";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";
import { BREEZY_CANDIDATES_SOURCE } from "@/lib/breezy-candidates-sync";

type CandidatesAdminDiagnosticsProps = {
  syncData: BreezyCandidatesSuccess | null;
  syncHeaderLine: string | null;
  syncAlert: string | null;
  enrichmentWarnings: string[];
  showSyncAlert: boolean;
  showBackgroundSyncLine: boolean;
  backgroundSyncLine: string | null;
  onboardingConfigLoaded: boolean;
  onboardingConfigured: boolean;
  onboardingConfigError: string | null;
  paperworkTemplateWarning: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};

export function CandidatesAdminDiagnostics({
  syncData,
  syncHeaderLine,
  syncAlert,
  enrichmentWarnings,
  showSyncAlert,
  showBackgroundSyncLine,
  backgroundSyncLine,
  onboardingConfigLoaded,
  onboardingConfigured,
  onboardingConfigError,
  paperworkTemplateWarning,
  refreshing,
  onRefresh,
}: CandidatesAdminDiagnosticsProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
      >
        <span>
          <span className="text-lg font-semibold text-zinc-50">Admin & diagnostics</span>
          <span className="mt-1 block text-sm font-normal text-zinc-500">
            Cache, sync metadata, and system-level ATS information.
          </span>
        </span>
        <span className="shrink-0 text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <AdminDiagnosticsBody
          syncData={syncData}
          syncHeaderLine={syncHeaderLine}
          syncAlert={syncAlert}
          enrichmentWarnings={enrichmentWarnings}
          showSyncAlert={showSyncAlert}
          showBackgroundSyncLine={showBackgroundSyncLine}
          backgroundSyncLine={backgroundSyncLine}
          onboardingConfigLoaded={onboardingConfigLoaded}
          onboardingConfigured={onboardingConfigured}
          onboardingConfigError={onboardingConfigError}
          paperworkTemplateWarning={paperworkTemplateWarning}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />
      ) : null}
    </section>
  );
}

function AdminDiagnosticsBody({
  syncData,
  syncHeaderLine,
  syncAlert,
  enrichmentWarnings,
  showSyncAlert,
  showBackgroundSyncLine,
  backgroundSyncLine,
  onboardingConfigLoaded,
  onboardingConfigured,
  onboardingConfigError,
  paperworkTemplateWarning,
  refreshing,
  onRefresh,
}: CandidatesAdminDiagnosticsProps) {
  return (
    <div className="space-y-3 border-t border-zinc-800/80 px-4 pb-4 pt-3 text-sm text-zinc-400 sm:px-5 sm:pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          Source: {BREEZY_CANDIDATES_SOURCE.label} · {BREEZY_CANDIDATES_SOURCE.apiPath}
        </p>
        <button
          type="button"
          disabled={refreshing}
          onClick={onRefresh}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          {refreshing ? "Syncing…" : "Refresh / Sync"}
        </button>
      </div>
      {syncHeaderLine ? <p className="text-xs tabular-nums text-zinc-500">{syncHeaderLine}</p> : null}
      {showSyncAlert && syncAlert ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {syncAlert}
        </p>
      ) : null}
      {showBackgroundSyncLine && backgroundSyncLine ? (
        <p className="rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2 text-xs text-teal-100">
          {backgroundSyncLine}
        </p>
      ) : null}
      {enrichmentWarnings.length > 0 ? (
        <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          {enrichmentWarnings.join(" ")}
        </p>
      ) : null}
      {syncData ? (
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-zinc-600">Candidates cached</dt>
            <dd className="text-zinc-300">{syncData.candidates.length}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Fetched at</dt>
            <dd className="text-zinc-300">{syncData.fetchedAt}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Partial sync</dt>
            <dd className="text-zinc-300">{syncData.partial ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">From cache</dt>
            <dd className="text-zinc-300">{syncData.fromCache ? "Yes" : "No"}</dd>
          </div>
        </dl>
      ) : null}
      {onboardingConfigLoaded && onboardingConfigError ? (
        <p className="text-xs text-amber-200/90">Dropbox Sign: {onboardingConfigError}</p>
      ) : null}
      {onboardingConfigLoaded && !onboardingConfigured && !onboardingConfigError ? (
        <p className="text-xs text-amber-200/90">
          Dropbox Sign not configured — set DROPBOX_SIGN_API_KEY in .env.local.
        </p>
      ) : null}
      {paperworkTemplateWarning ? (
        <p className="text-xs text-amber-200/90">
          Set DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET to enable paperwork send.
        </p>
      ) : null}
    </div>
  );
}
