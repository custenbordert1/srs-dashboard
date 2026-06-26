"use client";

import { GlassPanel } from "@/components/executive/ui/glass-panel";
import { HealthGauge } from "@/components/executive/ui/health-gauge";
import {
  IconAlertTriangle,
  IconSparkles,
  IconTrendingUp,
} from "@/components/executive/ui/executive-icons";
import { InsightCard } from "@/components/executive/ui/insight-card";
import { InsightList } from "@/components/executive/ui/insight-list";
import { OpportunityCard } from "@/components/executive/ui/opportunity-card";
import { RiskCard } from "@/components/executive/ui/risk-card";
import { executiveGlass, firstNameFromDisplayName, getTimeGreeting } from "@/components/executive/ui/executive-tokens";
import type { ExecutiveSnapshotContent, ExecutiveSnapshotLine } from "@/lib/build-executive-home-snapshot";

export type ExecutiveBriefingHealth = {
  platformHealth: number | null;
  recruitingHealth: number | null;
  operationsHealthLabel: string;
  automationReadiness: number | null;
  recruitingLoading?: boolean;
  platformLoading?: boolean;
  operationsLoading?: boolean;
  automationLoading?: boolean;
  /** @deprecated Use per-metric loading flags */
  loading?: boolean;
};

type ExecutiveHeroProps = {
  userName?: string | null;
  snapshot: ExecutiveSnapshotContent;
  health: ExecutiveBriefingHealth;
  lastUpdated?: string | null;
};

function highlightLine(items: ExecutiveSnapshotLine[], fallback: string): { text: string; href?: string } {
  const first = items[0];
  if (!first) return { text: fallback };
  return { text: first.text, href: first.href };
}

export function ExecutiveHero({ userName, snapshot, health, lastUpdated }: ExecutiveHeroProps) {
  const greeting = getTimeGreeting();
  const firstName = firstNameFromDisplayName(userName);
  const biggestRisk = highlightLine(snapshot.topRisks, "No critical risks flagged in this snapshot.");
  const biggestOpportunity = highlightLine(
    snapshot.topOpportunities,
    "No major opportunities surfaced yet — review pipeline intelligence for momentum.",
  );

  return (
    <section className="ex-fade-in space-y-8">
      <GlassPanel className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.08),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(45,212,191,0.06),transparent_55%)]"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-zinc-500">{greeting},</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">{firstName}</h1>
            <p className="mt-3 text-base leading-relaxed text-zinc-400">
              Your executive briefing — understand recruiting health, risk, and opportunity in under ten seconds.
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            {lastUpdated && lastUpdated !== "—" ? (
              <p className="text-xs text-zinc-500">
                Updated <span className="text-zinc-400">{lastUpdated}</span>
              </p>
            ) : null}
            <a
              href="#ai-command-center"
              className={[
                "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-100",
                executiveGlass.chip,
                "transition-all duration-200 hover:-translate-y-px hover:bg-sky-500/10 hover:text-sky-50",
              ].join(" ")}
            >
              <IconSparkles size={16} />
              Executive AI · Preview · Ready
            </a>
          </div>
        </div>

        <div className="relative mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
          <HealthGauge
            label="Recruiting health"
            value={health.recruitingHealth}
            loading={health.recruitingLoading ?? health.loading}
          />
          <HealthGauge
            label="Operations health"
            textValue={health.operationsHealthLabel}
            loading={health.operationsLoading ?? health.loading}
          />
          <HealthGauge
            label="Platform health"
            value={health.platformHealth}
            loading={health.platformLoading ?? health.loading}
          />
          <HealthGauge
            label="Automation readiness"
            value={health.automationReadiness}
            loading={health.automationLoading ?? health.loading}
          />
        </div>
      </GlassPanel>

      <div className="grid gap-5 lg:grid-cols-3">
        <RiskCard
          icon={<IconAlertTriangle size={16} />}
          href={biggestRisk.href}
        >
          {biggestRisk.href ? biggestRisk.text : biggestRisk.text}
        </RiskCard>

        <OpportunityCard icon={<IconTrendingUp size={16} />} href={biggestOpportunity.href}>
          {biggestOpportunity.text}
        </OpportunityCard>

        <InsightCard title="Today's priorities" badge={`${snapshot.topPriorities.length} items`}>
          <InsightList
            items={snapshot.topPriorities.slice(0, 4).map((item) => ({
              id: item.text,
              text: item.text,
              href: item.href,
            }))}
            emptyMessage="No urgent priorities flagged."
            bulletClassName="text-amber-400/70"
          />
        </InsightCard>
      </div>
    </section>
  );
}

/** @deprecated Use ExecutiveHero */
export const ExecutiveBriefingHero = ExecutiveHero;
