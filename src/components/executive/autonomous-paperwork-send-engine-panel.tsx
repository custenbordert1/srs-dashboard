"use client";

import { ExecutiveCard, ExecutiveButton, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useP184AutonomousPaperworkSend } from "@/hooks/use-p184-autonomous-paperwork-send";
import { useP185ProductionPaperworkAutomation } from "@/hooks/use-p185-production-paperwork-automation";

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AutonomousPaperworkSendEnginePanel() {
  const { metrics, config, loading, acting, error, refresh, runDryRun, runLive, lastResult, warnings } =
    useP184AutonomousPaperworkSend();
  const p185 = useP185ProductionPaperworkAutomation();

  const rate = metrics?.rateLimitStatus;
  const d = p185.dashboard;
  const r3 = d?.p1853;
  const phaseLabel = (r3?.phase ?? "awaiting_configuration")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const schedulerLabel =
    d?.scheduler === "active"
      ? "Active"
      : d?.scheduler === "paused"
        ? "Paused"
        : d?.scheduler === "misconfigured"
          ? "Misconfigured"
          : d?.scheduler === "disabled"
            ? "Disabled"
            : "—";

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Paperwork automation"
        subtitle="P184 send engine + P185 production scheduled runner — eligibility, queue, lease, reconciliation, and health."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExecutiveButton onClick={() => runDryRun()} disabled={acting || p185.acting}>
              {acting ? "Running…" : "Dry run (P184)"}
            </ExecutiveButton>
            {config?.enabled ? (
              <ExecutiveButton onClick={() => runLive()} disabled={acting || p185.acting}>
                Live cycle (P184)
              </ExecutiveButton>
            ) : null}
            <ExecutiveButton onClick={() => p185.runDryRun()} disabled={p185.acting}>
              Scheduled dry-run
            </ExecutiveButton>
            <ExecutiveButton onClick={() => refresh()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </ExecutiveButton>
            <ExecutiveButton onClick={() => p185.refresh()} disabled={p185.loading}>
              Refresh scheduler
            </ExecutiveButton>
          </div>
        }
      />

      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Engine is {config?.enabled ? "ENABLED" : "DISABLED"} · mode {config?.mode ?? "dry_run"}. Live
        scheduled sends require P185 gates (durable storage, dry-run validation, kill switch clear) and
        never bypass duplicate/idempotency protections.
      </p>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      {p185.error ? <p className="mt-2 text-sm text-red-400">{p185.error}</p> : null}
      {warnings.length > 0 ? (
        <p className="mt-2 text-xs text-zinc-400">{warnings.join(" · ")}</p>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Production scheduler (P185)
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Scheduler" value={schedulerLabel} />
          <MetricCard label="Automation mode" value={d?.automationMode ?? "—"} />
          <MetricCard label="Last cycle" value={fmt(d?.lastCycle?.finishedAt)} />
          <MetricCard label="Last live send" value={fmt(d?.lastSuccessfulLiveSend)} />
          <MetricCard label="Next expected run" value={fmt(d?.nextExpectedRun)} />
          <MetricCard
            label="Lease"
            value={
              d?.leaseStatus?.held
                ? `Held (${d.leaseStatus.ownerId ?? "?"})`
                : d?.leaseStatus?.stale
                  ? "Stale"
                  : "Free"
            }
          />
          <MetricCard label="Queue depth" value={d?.queueDepth ?? metrics?.queueDepth ?? 0} />
          <MetricCard label="Eligible now" value={d?.eligibleNow ?? metrics?.eligibleNow ?? 0} />
          <MetricCard label="Sent today" value={d?.sentToday ?? metrics?.completedToday ?? 0} />
          <MetricCard label="Confirmed today" value={d?.confirmedToday ?? 0} />
          <MetricCard label="Failed today" value={d?.failedToday ?? metrics?.failedToday ?? 0} />
          <MetricCard label="Unverified sends" value={d?.unverifiedSends ?? 0} />
          <MetricCard label="Retry backlog" value={d?.retryBacklog ?? metrics?.retries ?? 0} />
          <MetricCard
            label="Circuit breaker"
            value={d?.circuitBreaker?.open ? "OPEN" : "Closed"}
          />
          <MetricCard
            label="Storage"
            value={d?.storageHealth?.durable ? "Durable" : d?.storageHealth?.adapter ?? "—"}
          />
          <MetricCard
            label="Breezy"
            value={d?.breezyHealth?.healthy ? "Healthy" : "Degraded"}
          />
          <MetricCard
            label="Dropbox Sign"
            value={d?.dropboxSignHealth?.healthy ? "Healthy" : "Unavailable"}
          />
          <MetricCard label="Existing packets active" value={d?.existingPacketsActive ?? 0} />
          <MetricCard label="Awaiting signature" value={d?.awaitingSignature ?? 0} />
          <MetricCard label="Signed/completed" value={d?.signedCompleted ?? 0} />
          <MetricCard label="Eligible new packets" value={d?.eligibleNewPackets ?? 0} />
          <MetricCard label="Replacement review" value={d?.replacementReview ?? 0} />
          <MetricCard label="Awaiting hiring approval" value={d?.awaitingHiringApproval ?? 0} />
          <MetricCard label="Unresolved job mappings" value={d?.unresolvedJobMappings ?? 0} />
          <MetricCard
            label="Job mapping coverage"
            value={
              d?.jobMappingCoveragePct != null ? `${d.jobMappingCoveragePct}%` : "—"
            }
          />
          <MetricCard label="Applied / not selected" value={d?.appliedNotSelected ?? 0} />
          <MetricCard
            label="Est. backlog clearance"
            value={
              d?.estimatedBacklogClearanceMinutes != null
                ? `${d.estimatedBacklogClearanceMinutes} min`
                : "—"
            }
          />
          <MetricCard label="Selection evidence found" value={d?.selectionEvidenceFound ?? 0} />
          <MetricCard label="Verified selected" value={d?.verifiedSelectedCandidates ?? 0} />
          <MetricCard label="Ready for paperwork" value={d?.readyForPaperwork ?? 0} />
          <MetricCard label="Template blocked" value={d?.templateBlocked ?? 0} />
          <MetricCard label="Selected unresolved jobs" value={d?.selectedUnresolvedJobs ?? 0} />
          <MetricCard label="Needs operator confirmation" value={d?.needsOperatorConfirmation ?? 0} />
          <MetricCard label="P185.2 queue depth" value={d?.p1852QueueDepth ?? 0} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Operator-review cohorts: P185.1 A–F in{" "}
          <code className="text-zinc-400">.data/p185-1-operator-review-local.json</code>; P185.2 A–I
          in <code className="text-zinc-400">.data/p185-2-selected-hire-operator-review-local.json</code>
          . Last P185.2 recovery: {fmt(d?.p1852LastRunAt)}.
        </p>

        <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Controlled live rollout (P185.3)
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Rollout phase" value={phaseLabel} />
          <MetricCard label="Rollout ID" value={r3?.rolloutId ?? "—"} />
          <MetricCard label="Approved cohort" value={r3?.approvedCohort ?? 0} />
          <MetricCard label="Still eligible" value={r3?.stillEligible ?? 0} />
          <MetricCard
            label="Canary authorization"
            value={
              r3?.phase === "canary_passed_awaiting_backlog" ||
              r3?.phase === "canary_running" ||
              (r3?.canarySent ?? 0) > 0
                ? "Granted / in progress"
                : "Required"
            }
          />
          <MetricCard label="Canary queued" value={r3?.canaryQueued ?? 0} />
          <MetricCard label="Canary sent" value={r3?.canarySent ?? 0} />
          <MetricCard label="Canary confirmed" value={r3?.canaryConfirmed ?? 0} />
          <MetricCard label="Remaining backlog" value={r3?.remainingBacklog ?? 0} />
          <MetricCard label="Current cycle" value={r3?.currentCycle ?? 0} />
          <MetricCard label="Next operator action" value={r3?.nextScheduledAction ?? "—"} />
          <MetricCard label="Sent (rollout)" value={r3?.sentToday ?? 0} />
          <MetricCard label="Confirmed (rollout)" value={r3?.confirmedToday ?? 0} />
          <MetricCard label="Sent unverified" value={r3?.sentUnverified ?? 0} />
          <MetricCard label="Failed (rollout)" value={r3?.failed ?? 0} />
          <MetricCard label="Blocked after approval" value={r3?.blockedAfterApproval ?? 0} />
          <MetricCard label="Duplicates prevented" value={r3?.duplicatesPrevented ?? 0} />
          <MetricCard label="Circuit (rollout)" value={r3?.circuitBreaker ?? "—"} />
          <MetricCard label="Kill switch (rollout)" value={r3?.killSwitch ? "ON" : "Off"} />
          <MetricCard label="Storage (rollout)" value={r3?.storageHealth ?? "—"} />
          <MetricCard label="Dropbox (rollout)" value={r3?.dropboxSignHealth ?? "—"} />
          <MetricCard label="Scheduler (rollout)" value={r3?.schedulerHealth ?? "—"} />
          <MetricCard
            label="Lease"
            value={
              d?.leaseStatus?.held
                ? `Held (${d.leaseStatus.ownerId ?? "?"})`
                : d?.leaseStatus?.stale
                  ? "Stale"
                  : "Free"
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ExecutiveButton onClick={() => p185.p1853FinalDryRun()} disabled={p185.acting}>
            Run final dry-run
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853StartCanary()} disabled={p185.acting}>
            Start five-candidate canary
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853PauseRollout()} disabled={p185.acting}>
            Pause rollout
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853ResumeAfterCanary()} disabled={p185.acting}>
            Resume after verified canary
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853ReleaseBacklog()} disabled={p185.acting}>
            Release backlog cycle
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853KillSwitchOn()} disabled={p185.acting}>
            Activate kill switch
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853ResetCircuit()} disabled={p185.acting}>
            Reset circuit breaker
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853Reconcile()} disabled={p185.acting}>
            Reconcile rollout envelopes
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.p1853CancelRemaining()} disabled={p185.acting}>
            Cancel remaining unsent
          </ExecutiveButton>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <ExecutiveButton onClick={() => p185.pause()} disabled={p185.acting}>
            Pause
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.resume()} disabled={p185.acting}>
            Resume
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.activateKillSwitch()} disabled={p185.acting}>
            Kill switch
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.clearKillSwitch()} disabled={p185.acting}>
            Clear kill switch
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.openCircuit()} disabled={p185.acting}>
            Open circuit
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.resetCircuit()} disabled={p185.acting}>
            Reset circuit
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.runLiveCycle()} disabled={p185.acting}>
            Authorized live cycle
          </ExecutiveButton>
          <ExecutiveButton onClick={() => p185.reconcile()} disabled={p185.acting}>
            Reconcile envelopes
          </ExecutiveButton>
        </div>
      </div>

      {loading && !metrics ? (
        <p className="mt-4 text-sm text-zinc-500">Loading paperwork automation…</p>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Send engine (P184)
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Eligible now" value={metrics?.eligibleNow ?? 0} />
            <MetricCard label="Queued" value={metrics?.queued ?? 0} />
            <MetricCard label="Sending" value={metrics?.sending ?? 0} />
            <MetricCard label="Completed today" value={metrics?.completedToday ?? 0} />
            <MetricCard label="Failed today" value={metrics?.failedToday ?? 0} />
            <MetricCard label="Retries" value={metrics?.retries ?? 0} />
            <MetricCard
              label="Rate limit"
              value={
                rate?.limited
                  ? `Limited (${rate.limitedBy.join(", ")})`
                  : `${rate?.sentLastMinute ?? 0}/${rate?.config.maxPerMinute ?? 0}/min`
              }
            />
            <MetricCard
              label="Avg send time"
              value={metrics?.averageSendTimeMs != null ? `${metrics.averageSendTimeMs}ms` : "—"}
            />
            <MetricCard label="Success %" value={`${metrics?.successPct ?? 100}%`} />
            <MetricCard label="Queue depth" value={metrics?.queueDepth ?? 0} />
          </div>
        </div>
      )}

      {lastResult ? (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          Last P184 cycle: {lastResult.mode} in {lastResult.durationMs}ms — eligible {lastResult.eligible},
          sent {lastResult.sent}, failed {lastResult.failed}, retries {lastResult.retriesScheduled}
          {lastResult.rateLimited ? ", rate-limited" : ""}
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
