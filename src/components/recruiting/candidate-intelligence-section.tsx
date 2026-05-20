"use client";

import { useRecruitingIntelligence } from "@/hooks/use-recruiting-intelligence";
import type { CandidateIntelligenceProfile } from "@/lib/candidate-intelligence-engine";
import { AI_SCORE_TIER_STYLES } from "@/lib/candidate-ai-scoring";

const TIER_STYLES = AI_SCORE_TIER_STYLES;

function ProfileCard({ profile }: { profile: CandidateIntelligenceProfile }) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 transition-all duration-300 hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-zinc-100">{profile.candidateName}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {profile.positionName} · {profile.city}, {profile.state}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums text-teal-200">{profile.score}</p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${TIER_STYLES[profile.tier]}`}
          >
            {profile.tierLabel}
          </span>
        </div>
      </div>

      {profile.bestFit ? (
        <p className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-100">
          <span className="font-semibold">Best fit</span>
          {profile.bestFitReason ? ` — ${profile.bestFitReason}` : null}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Strengths</p>
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
            {profile.strengths.map((s) => (
              <li key={s}>+ {s}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Concerns</p>
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
            {profile.concerns.length > 0 ? (
              profile.concerns.map((c) => <li key={c}>− {c}</li>)
            ) : (
              <li className="text-zinc-600">None flagged</li>
            )}
          </ul>
        </div>
      </div>

      {profile.extractedKeywords.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {profile.extractedKeywords.map((kw) => (
            <span
              key={kw}
              className="rounded-md border border-zinc-700/80 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400"
            >
              {kw}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 border-t border-zinc-800/80 pt-3 text-xs text-zinc-500">
        <p>
          <span className="text-zinc-600">Territories:</span>{" "}
          {profile.recommendedTerritories.length > 0
            ? profile.recommendedTerritories.join(", ")
            : "—"}
        </p>
        <p className="mt-1">
          <span className="text-zinc-600">Projects:</span> {profile.suggestedProjects.join(" · ")}
        </p>
      </div>
    </article>
  );
}

type CandidateIntelligenceSectionProps = {
  compact?: boolean;
};

export function CandidateIntelligenceSection({ compact = false }: CandidateIntelligenceSectionProps) {
  const { data, error, loading, refreshing, refresh } = useRecruitingIntelligence();

  if (loading && !data) {
    return (
      <section className="space-y-4 border-t border-zinc-800/80 pt-8">
        <div className="h-7 w-64 animate-pulse rounded bg-zinc-800/80" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: compact ? 3 : 6 }, (_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40" />
          ))}
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="border-t border-zinc-800/80 pt-8">
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      </section>
    );
  }

  if (!data) return null;

  const intel = data.candidateIntelligence;
  const displayProfiles = compact ? intel.profiles.slice(0, 6) : intel.profiles.slice(0, 12);

  return (
    <section className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Candidate intelligence</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            AI scoring across merchandising fit, retail experience, travel radius, territory alignment,
            responsiveness, and interview likelihood.
            {refreshing ? <span className="ml-2 text-teal-400/90">Updating…</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          Refresh scores
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-teal-200/70">Avg score</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-teal-100">{intel.averageScore}</p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Scored</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{intel.scoredCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-emerald-200/70">Best fit</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-100">
            {intel.bestFitCandidates.length}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Territory</p>
          <p className="mt-1 text-sm font-medium text-zinc-200">{data.territoryLabel}</p>
        </div>
      </div>

      {intel.bestFitCandidates.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Best fit recommendations</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {intel.bestFitCandidates.slice(0, compact ? 2 : 4).map((profile) => (
              <ProfileCard key={profile.candidateId} profile={profile} />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-zinc-300">Top scored candidates</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayProfiles.map((profile) => (
            <ProfileCard key={profile.candidateId} profile={profile} />
          ))}
        </div>
      </div>
    </section>
  );
}
