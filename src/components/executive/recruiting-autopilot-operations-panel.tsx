"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import { useRecruitingAutopilotOperations } from "@/hooks/use-recruiting-autopilot-operations";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatUptime(ms: number | null): string {
  if (ms == null) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function statusTone(status: string): "success" | "warning" | "neutral" | "critical" {
  if (status === "running" || status === "idle") return "success";
  if (status === "paused") return "warning";
  if (status === "error") return "critical";
  return "neutral";
}

export function RecruitingAutopilotOperationsPanel() {
  const {
    dashboard,
    recentSends,
    exceptions,
    warnings,
    sectionErrors,
    loading,
    loadingCeilingHit,
    showingCachedSnapshot,
    actionBusy,
    actionMessage,
    actionError,
    evaluationPreview,
    evaluationPreviewBusy,
    evaluationPreviewError,
    cycleReport,
    cycleBusy,
    cycleError,
    refresh,
    postControl,
    runEvaluationPreview,
    runFullAutonomousCycle,
  } = useRecruitingAutopilotOperations();

  if (loading) {
    return <ExecutivePanelLoading title="Recruiting Autopilot Operations" badge="P155" />;
  }

  if (loadingCeilingHit && !dashboard) {
    return (
      <ExecutivePanelError
        title="Recruiting Autopilot Operations"
        message="Dashboard requests timed out after 5 seconds. Breezy classification may still be running — retry shortly."
        onRetry={() => void refresh(true)}
      />
    );
  }

  if (!dashboard) {
    return (
      <ExecutivePanelError
        title="Recruiting Autopilot Operations"
        message={sectionErrors[0] ?? "Failed to load autopilot operations dashboard"}
        onRetry={() => void refresh(true)}
      />
    );
  }

  const s = dashboard.status;
  const t = dashboard.today;
  const q = dashboard.queue;
  const bannerWarnings = [...warnings, ...sectionErrors];

  return (
    <div className="space-y-6">
      {showingCachedSnapshot || bannerWarnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {showingCachedSnapshot ? (
            <p className="font-medium">Showing last successful dashboard snapshot.</p>
          ) : null}
          {bannerWarnings.length > 0 ? (
            <ExecutiveWarningList warnings={bannerWarnings} />
          ) : null}
        </div>
      ) : null}

      <ExecutiveCard id="p155-autopilot-status" variant="premium">
        <SectionHeader
          title="Autopilot Status"
          subtitle="P154.7 continuous runner — read-only monitoring; live cycles respect server caps"
          badge="P155"
        />

        <div className="mb-5 flex flex-wrap gap-2">
          <StatusBadge tone={s.enabled ? "success" : "neutral"}>
            {s.enabled ? "Enabled" : "Disabled"}
          </StatusBadge>
          <StatusBadge tone={statusTone(s.runnerStatus)}>{s.runnerStatus}</StatusBadge>
          <StatusBadge tone={s.continuousEnabled ? "warning" : "neutral"}>
            {s.continuousEnabled ? "Continuous ON (host)" : "Continuous OFF"}
          </StatusBadge>
          {s.processingLockHeld ? (
            <StatusBadge tone="warning">Lock held</StatusBadge>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Last run" value={formatTimestamp(s.lastRunAt)} />
          <MetricCard label="Next run" value={formatTimestamp(s.nextRunAt)} />
          <MetricCard label="Uptime" value={formatUptime(s.uptimeMs)} />
          <MetricCard label="Interval" value={`${s.intervalMinutes} min`} />
          <MetricCard label="Send cap / cycle" value={String(s.maxSendsPerCycle)} />
          <MetricCard label="Assignment cap / cycle" value={String(s.maxAssignmentsPerCycle)} />
        </div>
        {s.lastError ? (
          <p className="mt-4 text-sm text-amber-300">Last error: {s.lastError}</p>
        ) : null}
      </ExecutiveCard>

      <ExecutiveCard id="p155-today-activity">
        <SectionHeader title="Today's Activity" subtitle="Runner + audit cross-check" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Evaluated" value={t.candidatesEvaluated.toLocaleString()} />
          <MetricCard label="Assigned" value={t.recruitersAssigned.toLocaleString()} />
          <MetricCard label="Sent" value={t.paperworkSent.toLocaleString()} />
          <MetricCard label="Signed" value={t.paperworkSigned.toLocaleString()} />
          <MetricCard label="Active signatures" value={t.activeSignatureRequests.toLocaleString()} />
          <MetricCard label="Duplicates prevented" value={t.duplicatesPrevented.toLocaleString()} />
          <MetricCard label="Failures" value={t.failures.toLocaleString()} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p155-queue-health">
        <SectionHeader title="Queue Health" subtitle="P152 classification with workflow fallback" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Eligible" value={q.eligibleForPaperwork.toLocaleString()} />
          <MetricCard label="Waiting signature" value={q.waitingOnSignature.toLocaleString()} />
          <MetricCard label="Signed today" value={q.signedToday.toLocaleString()} />
          <MetricCard label="Invalid email" value={q.invalidEmail.toLocaleString()} />
          <MetricCard label="Duplicates" value={q.duplicateCandidates.toLocaleString()} />
          <MetricCard label="Manual review" value={q.manualReview.toLocaleString()} />
          <MetricCard label="Disqualified" value={q.disqualifiedArchived.toLocaleString()} />
          <MetricCard label="Queue remaining" value={q.queueRemaining.toLocaleString()} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p155-recent-sends">
        <SectionHeader title="Recent Sends" subtitle="Today's paperwork sends from audit log" />
        {recentSends.length === 0 ? (
          <p className="text-sm text-zinc-500">No sends recorded today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th className="pb-2 pr-3">Candidate</th>
                  <th className="pb-2 pr-3">Email</th>
                  <th className="pb-2 pr-3">Recruiter</th>
                  <th className="pb-2 pr-3">DM</th>
                  <th className="pb-2 pr-3">Request ID</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Sent</th>
                </tr>
              </thead>
              <tbody>
                {recentSends.map((row) => (
                  <tr key={`${row.candidateId}-${row.sentAt}`} className="border-t border-zinc-800/60">
                    <td className="py-2 pr-3">{row.candidateName}</td>
                    <td className="py-2 pr-3">{row.email}</td>
                    <td className="py-2 pr-3">{row.recruiter}</td>
                    <td className="py-2 pr-3">{row.dm}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {row.signatureRequestId?.slice(0, 12) ?? "—"}…
                    </td>
                    <td className="py-2 pr-3">
                      {row.status}
                      {row.dryRun ? " (dry)" : ""}
                    </td>
                    <td className="py-2">{formatTimestamp(row.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExecutiveCard>

      <ExecutiveCard id="p155-exceptions">
        <SectionHeader title="Exceptions" subtitle="Failed sends, webhooks, duplicates, manual review" />
        {exceptions.length === 0 ? (
          <p className="text-sm text-zinc-500">No exceptions today.</p>
        ) : (
          <ul className="space-y-2 text-sm text-zinc-300">
            {exceptions.slice(0, 25).map((row) => (
              <li key={row.id} className="rounded border border-zinc-800/60 px-3 py-2">
                <span className="text-xs uppercase text-zinc-500">{row.category}</span>
                {" — "}
                <strong>{row.candidateName ?? "system"}</strong>
                {": "}
                {row.detail}
              </li>
            ))}
          </ul>
        )}
      </ExecutiveCard>

      <ExecutiveCard id="p243-full-autonomous-cycle" variant="premium">
        <SectionHeader
          title="Full Autonomous Cycle"
          subtitle="P243 end-to-end: pull → P204/CEO score → decide → plan paperwork (dry-run default; live = canary)"
          badge="P243"
        />
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusBadge tone={cycleReport && !cycleReport.dryRun ? "warning" : "success"}>
            {cycleReport
              ? cycleReport.dryRun
                ? "DRY-RUN"
                : cycleReport.executionMode === "full_live"
                  ? "FULL-LIVE"
                  : "CANARY-LIVE"
              : "dry-run first"}
          </StatusBadge>
          {cycleReport?.ceoTraceId ? (
            <StatusBadge tone="neutral">
              {`CEO ${cycleReport.ceoTraceId.slice(0, 8)}…`}
            </StatusBadge>
          ) : null}
          {cycleReport ? (
            <StatusBadge tone={cycleReport.failures > 0 ? "warning" : "success"}>
              {`failures ${cycleReport.failures}`}
            </StatusBadge>
          ) : null}
          {cycleReport?.ingestion?.source ? (
            <StatusBadge tone="neutral">{`ingest ${cycleReport.ingestion.source}`}</StatusBadge>
          ) : null}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Pulled" value={cycleReport ? String(cycleReport.pulled) : "—"} />
          <MetricCard label="Scored" value={cycleReport ? String(cycleReport.scored) : "—"} />
          <MetricCard
            label="Auto-advance"
            value={cycleReport ? String(cycleReport.autoAdvance) : "—"}
          />
          <MetricCard
            label="Paperwork planned"
            value={cycleReport ? String(cycleReport.paperworkPlanned) : "—"}
          />
          <MetricCard
            label="Paperwork sent"
            value={cycleReport ? String(cycleReport.paperworkSent) : "—"}
          />
          <MetricCard
            label="Success rate"
            value={
              cycleReport?.successRatePct != null ? `${cycleReport.successRatePct}%` : "—"
            }
          />
          <MetricCard
            label="Advance rate"
            value={
              cycleReport?.advanceRatePct != null ? `${cycleReport.advanceRatePct}%` : "—"
            }
          />
          <MetricCard
            label="Human review"
            value={cycleReport ? String(cycleReport.humanReview) : "—"}
          />
          <MetricCard
            label="Fresh Reset Applied"
            value={
              cycleReport?.freshResetApplied != null
                ? String(cycleReport.freshResetApplied)
                : "—"
            }
          />
        </div>
        {cycleReport?.warnings && cycleReport.warnings.length > 0 ? (
          <ul className="mb-3 space-y-1 text-sm text-amber-200/90">
            {cycleReport.warnings.slice(0, 5).map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-emerald-700/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100"
            disabled={cycleBusy || actionBusy}
            onClick={() =>
              void runFullAutonomousCycle({ limit: 25, dryRun: true, forceFreshReset: true })
            }
          >
            {cycleBusy ? "Running…" : "Run Full Autonomous Cycle (dry-run + fresh reset)"}
          </button>
          <button
            type="button"
            className="rounded-md border border-emerald-700/60 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100"
            disabled={cycleBusy || actionBusy}
            onClick={() => void runFullAutonomousCycle({ limit: 25, dryRun: true })}
          >
            {cycleBusy ? "Running…" : "Run Full Autonomous Cycle (dry-run)"}
          </button>
          <button
            type="button"
            className="rounded-md border border-amber-700/60 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100"
            disabled={cycleBusy || actionBusy}
            onClick={() => {
              const ok = window.confirm(
                "Run P243 CANARY LIVE (max 3 paperwork sends)? Requires Dropbox testMode=true and confirmLive.",
              );
              if (!ok) return;
              void runFullAutonomousCycle({
                limit: 25,
                dryRun: false,
                confirmLive: true,
                canaryLimit: 3,
              });
            }}
          >
            Canary live (limit 3)
          </button>
        </div>
        {cycleError ? <p className="mt-3 text-sm text-red-400">{cycleError}</p> : null}
      </ExecutiveCard>

      <ExecutiveCard id="are-evaluation-preview">
        <SectionHeader
          title="Evaluation Engine Preview"
          subtitle="Thin P204 composer (CEO) — dry-run audit/timeline, LLM off by default"
          badge="CEO"
        />
        <div className="mb-3 flex flex-wrap gap-2">
          {evaluationPreview?.traceId ? (
            <StatusBadge tone="neutral">
              {`trace ${evaluationPreview.traceId.slice(0, 8)}…`}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">no trace yet</StatusBadge>
          )}
          <StatusBadge tone="success">dry-run</StatusBadge>
          <StatusBadge tone="neutral">
            {`audits ${evaluationPreview?.auditCount ?? 0}`}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {`timeline ${evaluationPreview?.timelineLength ?? 0}`}
          </StatusBadge>
          <StatusBadge
            tone={(evaluationPreview?.llmEnhancementsApplied ?? 0) > 0 ? "warning" : "neutral"}
          >
            {`LLM ${(evaluationPreview?.llmEnhancementsApplied ?? 0) > 0 ? "stubbed" : "off"}`}
          </StatusBadge>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <MetricCard
            label="Last preview evaluated"
            value={evaluationPreview ? String(evaluationPreview.evaluated) : "—"}
          />
          <MetricCard
            label="Auto-advance"
            value={evaluationPreview ? String(evaluationPreview.autoAdvance) : "—"}
          />
          <MetricCard
            label="Human review"
            value={evaluationPreview ? String(evaluationPreview.humanReview) : "—"}
          />
          <MetricCard
            label="Auto-reject"
            value={evaluationPreview ? String(evaluationPreview.autoReject) : "—"}
          />
          <MetricCard
            label="Paperwork tasks planned"
            value={evaluationPreview ? String(evaluationPreview.paperworkTasksPlanned) : "—"}
          />
          <MetricCard
            label="Avg latency"
            value={
              evaluationPreview ? `${evaluationPreview.averageLatencyMs} ms` : "—"
            }
          />
        </div>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
          disabled={evaluationPreviewBusy}
          onClick={() =>
            void runEvaluationPreview([
              {
                candidateId: "preview-demo-strong",
                candidateName: "Preview Strong",
                email: "strong@example.com",
                workflowStatus: "Applied",
                paperworkStatus: "not_sent",
                nearestJobMiles: 8,
                reasonCodes: ["strong_questionnaire", "nearby_work_available"],
                components: {
                  resumeScore: 82,
                  questionnaireScore: 80,
                  locationScore: 88,
                  readinessScore: 84,
                  fraudSpamScore: 0,
                  experienceYears: 3,
                  duplicateSuspect: false,
                },
              },
              {
                candidateId: "preview-demo-review",
                candidateName: "Preview Review",
                email: "review@example.com",
                workflowStatus: "Applied",
                paperworkStatus: "not_sent",
                nearestJobMiles: 45,
                reasonCodes: ["missing_questionnaire", "manual_review_40_60"],
                components: {
                  resumeScore: 60,
                  questionnaireScore: 30,
                  locationScore: 40,
                  readinessScore: 55,
                  fraudSpamScore: 0,
                  experienceYears: 1,
                  duplicateSuspect: false,
                },
              },
            ])
          }
        >
          {evaluationPreviewBusy ? "Running preview…" : "Run sample evaluation preview"}
        </button>
        {evaluationPreviewError ? (
          <p className="mt-3 text-sm text-red-400">{evaluationPreviewError}</p>
        ) : null}
      </ExecutiveCard>

      <ExecutiveCard id="p155-controls">
        <SectionHeader
          title="Controls"
          subtitle="Executive only — no continuous daemon start from UI"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void postControl("dry_cycle")}
          >
            Run dry cycle
          </button>
          <button
            type="button"
            className="rounded-md border border-amber-700/60 px-3 py-1.5 text-sm text-amber-200"
            disabled={actionBusy}
            onClick={() => {
              if (
                !window.confirm(
                  "Run one capped live cycle? Requires P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED=true on server.",
                )
              ) {
                return;
              }
              void postControl("live_cycle", { confirmLive: true });
            }}
          >
            Run capped live cycle
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void postControl("pause")}
          >
            Pause autopilot
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void postControl("resume")}
          >
            Resume autopilot
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void refresh(true)}
          >
            Refresh status
          </button>
        </div>
        {actionError ? <p className="mt-3 text-sm text-red-400">{actionError}</p> : null}
        {actionMessage ? <p className="mt-3 text-sm text-emerald-400">{actionMessage}</p> : null}
      </ExecutiveCard>
    </div>
  );
}
