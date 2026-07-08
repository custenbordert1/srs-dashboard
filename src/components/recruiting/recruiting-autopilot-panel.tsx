"use client";

import { SectionDegradedBanner, SectionErrorCard, SectionLoadingCard } from "@/components/ui/loading-state";
import { DisabledByDesignBadge } from "@/components/ui/loading-state/disabled-by-design-badge";
import { useAutonomousRecruiting } from "@/hooks/use-autonomous-recruiting";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import type {
  ApprovalRule,
  CoverageStatus,
  HiringRecommendationAction,
  PostingApprovalStatus,
  RecommendedAd,
  TerritoryCoverageNeed,
} from "@/lib/autonomous-recruiting-engine";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution";
import { useState } from "react";

const COVERAGE_STATUS_STYLES: Record<CoverageStatus, string> = {
  Healthy: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
  Watch: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  "At Risk": "border-orange-500/35 bg-orange-500/10 text-orange-100",
  Critical: "border-red-500/35 bg-red-500/10 text-red-100",
};

const APPROVAL_STYLES: Record<PostingApprovalStatus, string> = {
  pending: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  approved: "border-teal-500/35 bg-teal-500/10 text-teal-100",
  "auto-approved": "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
};

const HIRING_ACTION_STYLES: Record<HiringRecommendationAction, string> = {
  "Hire Now": "text-emerald-200",
  Interview: "text-teal-200",
  Hold: "text-amber-200",
  Reject: "text-zinc-400",
};

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}

function PipelineFlow({ steps }: { steps: { id: string; label: string; count: number }[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center gap-2">
          <div className="min-w-[7rem] rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{step.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{step.count}</p>
          </div>
          {index < steps.length - 1 ? <span className="text-zinc-600">→</span> : null}
        </div>
      ))}
    </div>
  );
}

function CoverageNeedsTable({ rows }: { rows: TerritoryCoverageNeed[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No territory coverage needs detected.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-2 py-2">Territory</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Score</th>
            <th className="px-2 py-2">Open / Reps</th>
            <th className="px-2 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row.territoryKey} className="border-t border-zinc-800/60">
              <td className="px-2 py-2 text-zinc-200">
                <div>{row.territoryLabel}</div>
                <div className="text-xs text-zinc-500">{row.dmName}</div>
              </td>
              <td className="px-2 py-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${COVERAGE_STATUS_STYLES[row.coverageStatus]}`}
                >
                  {row.coverageStatus}
                </span>
              </td>
              <td className="px-2 py-2 text-zinc-300">{row.coverageNeedScore}</td>
              <td className="px-2 py-2 text-zinc-400">
                {row.openCalls} / {row.activeReps}
              </td>
              <td className="px-2 py-2 text-xs text-zinc-400">{row.recommendedAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PostingRecommendationsList({
  rows,
  executionByRecommendation,
  onApprove,
  onExecute,
  busy,
}: {
  rows: RecommendedAd[];
  executionByRecommendation: Map<string, { id: string; status: string }>;
  onApprove: (executionId: string) => void;
  onExecute: (executionId: string) => void;
  busy: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No posting recommendations right now.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.slice(0, 10).map((row) => {
        const execution = executionByRecommendation.get(row.id);
        return (
        <li key={row.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-zinc-100">{row.title}</p>
              <p className="text-xs text-zinc-500">
                {row.city}, {row.state} · {row.territory}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] capitalize text-zinc-300">
                {row.priority}
              </span>
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize ${APPROVAL_STYLES[row.approvalStatus]}`}
              >
                {row.approvalStatus}
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">{row.reason}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Expected applicants: {row.expectedApplicants.min}–{row.expectedApplicants.max}
            {row.coverageNeedScore !== undefined ? ` · Coverage need ${row.coverageNeedScore}` : ""}
          </p>
          {execution ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-[10px] uppercase text-zinc-500">Execution: {execution.status}</span>
              {["detected", "recommended"].includes(execution.status) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApprove(execution.id)}
                  className="rounded-md border border-teal-500/40 px-2 py-0.5 text-[10px] text-teal-100 hover:bg-teal-500/15 disabled:opacity-50"
                >
                  Approve
                </button>
              ) : null}
              {execution.status === "approved" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onExecute(execution.id)}
                  className="rounded-md border border-emerald-500/40 px-2 py-0.5 text-[10px] text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-50"
                >
                  Execute
                </button>
              ) : null}
            </div>
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}

function HiringRecommendationsList({
  rows,
}: {
  rows: {
    candidateId: string;
    candidateName: string;
    positionName: string;
    recommendedAction: HiringRecommendationAction;
    grade: string;
    confidence: string;
    coverageContext: string;
    reasons: string[];
  }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No hiring recommendations right now.</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.slice(0, 10).map((row) => (
        <li key={row.candidateId} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-zinc-100">{row.candidateName}</p>
              <p className="text-xs text-zinc-500">{row.positionName}</p>
            </div>
            <span className={`text-xs font-semibold uppercase ${HIRING_ACTION_STYLES[row.recommendedAction]}`}>
              {row.recommendedAction}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Grade {row.grade} · {row.confidence} confidence
          </p>
          <p className="mt-1 text-xs text-zinc-500">{row.coverageContext}</p>
          <ul className="mt-2 list-disc pl-4 text-xs text-zinc-400">
            {row.reasons.slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {row.recommendedAction === "Reject" ? (
            <p className="mt-2 text-[10px] text-zinc-500">
              Recommendation only — recruiter oversight required; no auto-reject.
            </p>
          ) : null}
          <a
            href={`/?tab=candidates&candidateId=${row.candidateId}`}
            className="mt-2 inline-block text-xs text-teal-300 hover:text-teal-200"
          >
            Open candidate
          </a>
        </li>
      ))}
    </ul>
  );
}

function RulesTable({
  rules,
  onToggle,
  busy,
}: {
  rules: ApprovalRule[];
  onToggle: (rule: ApprovalRule) => void;
  busy: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-2 py-2">Rule</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Success</th>
            <th className="px-2 py-2">Last triggered</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-t border-zinc-800/60">
              <td className="px-2 py-2 text-zinc-200">{rule.name}</td>
              <td className="px-2 py-2 capitalize text-zinc-400">{rule.status}</td>
              <td className="px-2 py-2 text-zinc-400">{rule.successRate}%</td>
              <td className="px-2 py-2 text-xs text-zinc-500">
                {rule.lastTriggered ? new Date(rule.lastTriggered).toLocaleString() : "—"}
              </td>
              <td className="px-2 py-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggle(rule)}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {rule.status === "enabled" ? "Disable" : "Enable"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecruitingAutopilotPanel() {
  const {
    snapshot,
    executionSnapshot,
    loading,
    error,
    timedOut,
    showingCachedSnapshot,
    refresh,
    saveRules,
    evaluateRules,
    savingRules,
    actionBusy,
    approveExecution,
    executeExecution,
  } = useAutonomousRecruiting();
  const loadingCeilingHit = useLoadingCeiling(loading && !snapshot, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !snapshot && !loadingCeilingHit;
  const [rulesDraft, setRulesDraft] = useState<ApprovalRule[] | null>(null);

  if (showLoading) {
    return <SectionLoadingCard title="Recruiting Autopilot" rows={4} />;
  }

  if ((error || timedOut) && !snapshot) {
    return (
      <SectionErrorCard
        title="Recruiting Autopilot"
        message={error ?? "Recruiting autopilot is still loading. Retry shortly."}
        onRetry={() => refresh()}
      />
    );
  }

  if (!snapshot) {
    return (
      <SectionErrorCard
        title="Recruiting Autopilot"
        message="Autopilot snapshot unavailable — no cached data yet."
        onRetry={() => refresh()}
      />
    );
  }

  const rules = rulesDraft ?? snapshot.approvalRules;
  const executionByRecommendation = new Map<string, { id: string; status: string }>(
    (executionSnapshot?.executionQueue ?? []).map((row: ExecutionCorrelation) => [
      row.recommendationId,
      { id: row.id, status: row.status },
    ]),
  );

  const toggleRule = (rule: ApprovalRule) => {
    const next = rules.map((entry) =>
      entry.id === rule.id
        ? { ...entry, status: entry.status === "enabled" ? ("disabled" as const) : ("enabled" as const) }
        : entry,
    );
    setRulesDraft(next);
    void saveRules(next);
  };

  return (
    <section className="space-y-6">
      {(showingCachedSnapshot || error) && (
        <SectionDegradedBanner
          stale={showingCachedSnapshot}
          message={error ?? "Showing last loaded autopilot snapshot."}
          onRetry={() => refresh()}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Recruiting Autopilot</h2>
          <p className="text-sm text-zinc-500">
            Coverage-driven posting and hiring recommendations — recruiter oversight preserved.
          </p>
          <div className="mt-2">
            <DisabledByDesignBadge mode="observation" label="No autonomous sends from this panel" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={savingRules}
            onClick={() => void evaluateRules()}
            className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs text-teal-100 hover:bg-teal-500/25 disabled:opacity-50"
          >
            Evaluate rules
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Coverage needs" value={snapshot.kpis.coverageNeedsDetected} />
        <KpiCard label="Ads recommended" value={snapshot.kpis.adsRecommended} />
        <KpiCard label="Auto-approved ads" value={snapshot.kpis.adsAutoApproved} />
        <KpiCard label="Hire-ready candidates" value={snapshot.kpis.candidatesRecommendedForHire} />
        <KpiCard
          label="Est. hours saved"
          value={snapshot.kpis.estimatedHoursSaved}
          detail={snapshot.kpis.hoursSavedFormula}
        />
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Pipeline flow</h3>
        <div className="mt-3">
          <PipelineFlow steps={snapshot.pipelineFlow} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Coverage needs</h3>
          <div className="mt-3">
            <CoverageNeedsTable rows={snapshot.coverageNeeds} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Posting recommendations</h3>
          <div className="mt-3">
            <PostingRecommendationsList
              rows={snapshot.postingRecommendations}
              executionByRecommendation={executionByRecommendation}
              onApprove={(id) => void approveExecution(id)}
              onExecute={(id) => void executeExecution(id)}
              busy={actionBusy}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Hiring recommendations</h3>
          <div className="mt-3">
            <HiringRecommendationsList rows={snapshot.hiringRecommendations} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Approval rules</h3>
          <div className="mt-3">
            <RulesTable rules={rules} onToggle={toggleRule} busy={savingRules} />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Automation runs: {snapshot.automationRuns.pending} pending · {snapshot.automationRuns.executed}{" "}
            executed
          </p>
        </div>
      </div>
    </section>
  );
}
