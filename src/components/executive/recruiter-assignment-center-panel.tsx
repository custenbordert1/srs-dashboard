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
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import type {
  P1581SimulationWarning,
  P1581TerritoryHeatCell,
  P1581WorkloadRow,
} from "@/lib/p158-assignment-simulation/types";
import type { P1582CandidateDiagnosis } from "@/lib/p158-post-assignment-outcome-diagnosis/types";
import { useRecruiterAssignmentCenter } from "@/hooks/use-recruiter-assignment-center";
import { useRecruiterAssignmentSimulation } from "@/hooks/use-recruiter-assignment-simulation";

function QueueTable({ rows, emptyLabel }: { rows: P158AssignmentQueueItem[]; emptyLabel: string }) {
  if (rows.length === 0) return <p className="text-sm text-slate-400">{emptyLabel}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2">Candidate</th>
            <th className="px-3 py-2">Recruiter</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Territory</th>
            <th className="px-3 py-2">Reasoning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-b border-white/5 align-top">
              <td className="px-3 py-3">
                <div className="font-medium text-white">{row.candidateName}</div>
                <div className="text-xs text-slate-400">{row.assignedRecruiter}</div>
              </td>
              <td className="px-3 py-3 text-slate-200">{row.recommendedRecruiter ?? "—"}</td>
              <td className="px-3 py-3">
                <StatusBadge tone={row.confidence >= 80 ? "success" : "warning"}>
                  {String(row.confidence)}
                </StatusBadge>
              </td>
              <td className="px-3 py-3 text-slate-300">{row.priorityScore}</td>
              <td className="px-3 py-3 text-slate-300">{row.territory ?? "—"}</td>
              <td className="max-w-xs px-3 py-3 text-slate-300">
                <ul className="list-disc space-y-1 pl-4">
                  {row.reasoning.slice(0, 3).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkloadComparisonTable({ rows }: { rows: P1581WorkloadRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-400">No workload data</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2">Recruiter</th>
            <th className="px-3 py-2">Before</th>
            <th className="px-3 py-2">After</th>
            <th className="px-3 py-2">Delta</th>
            <th className="px-3 py-2">Utilization</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.recruiter} className="border-b border-white/5">
              <td className="px-3 py-2 font-medium text-white">{row.recruiter}</td>
              <td className="px-3 py-2 text-slate-300">{row.before}</td>
              <td className="px-3 py-2 text-slate-300">{row.after}</td>
              <td className="px-3 py-2">
                <StatusBadge tone={row.delta >= 10 ? "warning" : "neutral"}>
                  {row.delta >= 0 ? `+${row.delta}` : String(row.delta)}
                </StatusBadge>
              </td>
              <td className="px-3 py-2 text-slate-300">{row.utilizationPercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TerritoryHeatTable({ rows }: { rows: P1581TerritoryHeatCell[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-400">No territory data</p>;
  return (
    <ul className="space-y-2 text-sm text-slate-300">
      {rows.map((row) => (
        <li key={row.territory} className="rounded-lg border border-white/5 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-white">{row.territory}</span>
            <StatusBadge tone={row.imbalanceScore >= 70 ? "warning" : "neutral"}>
              {`imbalance ${row.imbalanceScore}`}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {row.unassignedBefore} → {row.unassignedAfter} unassigned · {row.assignedInSimulation}{" "}
            assigned · {row.openDemand} open demand
          </p>
        </li>
      ))}
    </ul>
  );
}

function SimulationWarningsList({ warnings }: { warnings: P1581SimulationWarning[] }) {
  if (warnings.length === 0) return <p className="text-sm text-slate-400">No warnings</p>;
  return (
    <ul className="space-y-2 text-sm">
      {warnings.map((w) => (
        <li
          key={`${w.code}-${w.message}`}
          className={`rounded-lg border px-3 py-2 ${
            w.severity === "critical"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
              : w.severity === "warning"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                : "border-white/10 text-slate-300"
          }`}
        >
          {w.message}
        </li>
      ))}
    </ul>
  );
}

function PostAssignmentDiagnosisTable({ rows }: { rows: P1582CandidateDiagnosis[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-400">No diagnosis data</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2">Candidate</th>
            <th className="px-3 py-2">Outcome</th>
            <th className="px-3 py-2">Blocker</th>
            <th className="px-3 py-2">Automatable</th>
            <th className="px-3 py-2">Recommended fix</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-b border-white/5 align-top">
              <td className="px-3 py-3">
                <div className="font-medium text-white">{row.candidateName}</div>
                <div className="text-xs text-slate-400">
                  {row.recruiter} · {row.workflowStatus}
                </div>
              </td>
              <td className="px-3 py-3 text-slate-200">{row.postAssignmentAction}</td>
              <td className="px-3 py-3">
                <div className="text-slate-200">{row.primaryBlocker}</div>
                <div className="text-xs text-slate-400">{row.blockerReason}</div>
              </td>
              <td className="px-3 py-3">
                <StatusBadge tone={row.automatable ? "success" : "neutral"}>
                  {row.automatable ? "yes" : "no"}
                </StatusBadge>
              </td>
              <td className="max-w-sm px-3 py-3 text-xs text-slate-300">{row.recommendedFix}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecruiterAssignmentCenterPanel() {
  const {
    dashboard,
    warnings,
    error,
    loading,
    loadingCeilingHit,
    refreshing,
    runBusy,
    runMessage,
    runError,
    refresh,
    runSimulation,
    runProduction,
  } = useRecruiterAssignmentCenter();

  const sim = useRecruiterAssignmentSimulation();

  if (loading) {
    return <ExecutivePanelLoading title="Recruiter Assignment Center" badge="P158" />;
  }

  if (loadingCeilingHit && !dashboard) {
    return (
      <ExecutivePanelError
        title="Recruiter Assignment Center"
        message="Assignment center timed out — retry shortly."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!dashboard) {
    return (
      <ExecutivePanelError
        title="Recruiter Assignment Center"
        message={error ?? "Failed to load assignment center"}
        onRetry={() => void refresh()}
      />
    );
  }

  const s = dashboard.summary;
  const bannerWarnings = [...warnings];
  if (error) bannerWarnings.push(error);

  return (
    <div className="space-y-6">
      {bannerWarnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <ExecutiveWarningList warnings={bannerWarnings} />
        </div>
      ) : null}

      <ExecutiveCard variant="premium">
        <SectionHeader
          title="Recruiter Assignment Center"
          subtitle={
            dashboard.simulationMode
              ? "P158 — simulation mode (production disabled)"
              : "P158 — production assignments enabled on server"
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10"
                disabled={refreshing || runBusy}
                onClick={() => void refresh()}
              >
                Refresh
              </button>
              <button
                type="button"
                className="rounded-lg border border-sky-400/40 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-500/10"
                disabled={runBusy}
                onClick={() => void runSimulation()}
              >
                Run Simulation
              </button>
              <button
                type="button"
                className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-500/10"
                disabled={runBusy || dashboard.simulationMode}
                onClick={() => void runProduction()}
              >
                Run Production
              </button>
            </div>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Queue" value={s.assignmentQueue} />
          <MetricCard label="High confidence" value={s.highConfidence} />
          <MetricCard label="Manual review" value={s.manualReview} />
          <MetricCard label="Skipped (existing)" value={s.skippedExisting} />
        </div>
        {(runMessage || runError) && (
          <p className={`mt-3 text-sm ${runError ? "text-rose-300" : "text-emerald-300"}`}>
            {runError ?? runMessage}
          </p>
        )}
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Assignment Queue" />
        <div className="mt-4">
          <QueueTable rows={dashboard.sections.assignmentQueue} emptyLabel="No assignments queued" />
        </div>
      </ExecutiveCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveCard>
          <SectionHeader title="High Confidence Assignments" />
          <div className="mt-4">
            <QueueTable rows={dashboard.sections.highConfidence} emptyLabel="None" />
          </div>
        </ExecutiveCard>
        <ExecutiveCard>
          <SectionHeader title="Needs Manual Review" />
          <div className="mt-4">
            <QueueTable rows={dashboard.sections.manualReview} emptyLabel="None" />
          </div>
        </ExecutiveCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveCard>
          <SectionHeader title="Recruiter Workload" />
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {dashboard.sections.recruiterWorkload.map((row) => (
              <li key={row.recruiter} className="rounded-lg border border-white/5 px-3 py-2">
                <span className="font-medium text-white">{row.recruiter}</span>
                <span className="text-slate-400">
                  {" "}
                  — {row.currentLoad} current · {row.projectedLoad} projected · {row.queuedAssignments} queued
                </span>
              </li>
            ))}
          </ul>
        </ExecutiveCard>
        <ExecutiveCard>
          <SectionHeader title="Territory Balance" />
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {dashboard.sections.territoryBalance.map((row) => (
              <li key={row.territory} className="rounded-lg border border-white/5 px-3 py-2">
                <span className="font-medium text-white">{row.territory}</span>
                <span className="text-slate-400">
                  {" "}
                  — {row.unassignedCandidates} unassigned · {row.openDemand} open demand
                </span>
              </li>
            ))}
          </ul>
        </ExecutiveCard>
      </div>

      <ExecutiveCard>
        <SectionHeader title="Today's Assignments" />
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {dashboard.sections.todaysAssignments.length === 0 ? (
            <li>No assignments today</li>
          ) : (
            dashboard.sections.todaysAssignments.map((event) => (
              <li key={event.id} className="rounded-lg border border-white/5 px-3 py-2">
                {event.candidateName} → {event.recruiter ?? "—"} ({event.action}, {event.confidence}%)
              </li>
            ))
          )}
        </ul>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Assignment Audit" />
        <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto text-sm text-slate-300">
          {dashboard.sections.assignmentAudit.map((event) => (
            <li key={event.id} className="rounded-lg border border-white/5 px-3 py-2">
              <span className="text-white">{new Date(event.at).toLocaleString()}</span>
              {" — "}
              {event.candidateName}: {event.action}
              {event.recruiter ? ` → ${event.recruiter}` : ""}
            </li>
          ))}
        </ul>
      </ExecutiveCard>

      {dashboard.transitionReport ? (
        <ExecutiveCard variant="premium">
          <SectionHeader
            title="Workflow Transition (P158.3)"
            subtitle={
              dashboard.transitionReport.transitionEnabled
                ? "Transition enabled on server — production requires confirmTransition"
                : "Dry-run only — P158_WORKFLOW_TRANSITION_ENABLED is false"
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Transition eligible"
              value={dashboard.transitionReport.summary.transitionEligible}
            />
            <MetricCard
              label="Transition blocked"
              value={dashboard.transitionReport.summary.transitionBlocked}
            />
            <MetricCard
              label="Paperwork Needed (dry-run)"
              value={dashboard.transitionReport.summary.dryRunTransitionCount}
            />
            <MetricCard
              label="Projected Send Paperwork"
              value={dashboard.transitionReport.summary.projectedSendPaperwork}
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2">Candidate</th>
                  <th className="px-3 py-2">Before → After</th>
                  <th className="px-3 py-2">Post-transition P157</th>
                  <th className="px-3 py-2">Blockers</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.transitionReport.sections.postTransitionDecisions.slice(0, 25).map((row) => (
                  <tr key={row.candidateId} className="border-b border-white/5 align-top">
                    <td className="px-3 py-3 font-medium text-white">{row.candidateName}</td>
                    <td className="px-3 py-3 text-slate-300">
                      {row.beforeWorkflowStatus} → {row.afterWorkflowStatus ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {row.postTransitionP157Action ?? "—"}
                      {row.postTransitionConfidence != null ? ` (${row.postTransitionConfidence}%)` : ""}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-400">
                      {row.blockers.length > 0 ? row.blockers.join("; ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <SectionHeader title="Transition Audit" />
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm text-slate-300">
              {dashboard.transitionReport.sections.transitionAudit.length === 0 ? (
                <li>No production transitions yet</li>
              ) : (
                dashboard.transitionReport.sections.transitionAudit.map((event) => (
                  <li key={event.id} className="rounded-lg border border-white/5 px-3 py-2">
                    {event.candidateName}: {event.action} ({event.beforeWorkflowStatus} →{" "}
                    {event.afterWorkflowStatus ?? "—"})
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="mt-4">
            <SectionHeader title="Rollback Available" />
            <ul className="mt-2 space-y-2 text-sm text-slate-300">
              {dashboard.transitionReport.sections.rollbackAvailable.length === 0 ? (
                <li>No pending rollbacks</li>
              ) : (
                dashboard.transitionReport.sections.rollbackAvailable.map((row) => (
                  <li key={row.rollbackId} className="rounded-lg border border-white/5 px-3 py-2">
                    {row.candidateId} — {row.rollbackId}
                  </li>
                ))
              )}
            </ul>
          </div>
        </ExecutiveCard>
      ) : null}

      {sim.loading && !sim.simulation ? (
        <ExecutivePanelLoading title="Assignment Simulation" badge="P158.1" />
      ) : sim.simulation ? (
        <>
          <ExecutiveCard variant="premium">
            <SectionHeader
              title="Assignment Simulation"
              subtitle="P158.1 — read-only impact preview (no production writes)"
              actions={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10"
                    disabled={sim.refreshing || sim.runBusy}
                    onClick={() => void sim.refresh()}
                  >
                    Refresh simulation
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-sky-400/40 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-500/10"
                    disabled={sim.runBusy}
                    onClick={() => void sim.runSimulation()}
                  >
                    Run impact simulation
                  </button>
                </div>
              }
            />
            {(sim.runMessage || sim.runError) && (
              <p className={`mt-3 text-sm ${sim.runError ? "text-rose-300" : "text-emerald-300"}`}>
                {sim.runError ?? sim.runMessage}
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Would assign"
                value={sim.simulation.summary.candidatesAssignedInSimulation}
              />
              <MetricCard
                label="Remaining unassigned"
                value={sim.simulation.summary.candidatesRemainingUnassigned}
              />
              <MetricCard
                label="Ready for paperwork"
                value={sim.simulation.summary.readyForPaperwork}
              />
              <MetricCard
                label="Avg utilization"
                value={`${sim.simulation.summary.avgRecruiterUtilization}%`}
              />
            </div>
          </ExecutiveCard>

          <ExecutiveCard>
            <SectionHeader title="Simulation Summary" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Evaluated" value={sim.simulation.summary.candidatesEvaluated} />
              <MetricCard label="Manual review" value={sim.simulation.summary.manualReview} />
              <MetricCard label="Follow up" value={sim.simulation.summary.followUp} />
              <MetricCard label="Blocked" value={sim.simulation.summary.blocked} />
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Territory imbalance: {sim.simulation.summary.territoryImbalanceScore}
              {sim.simulation.summary.largestWorkloadIncrease
                ? ` · Largest spike: ${sim.simulation.summary.largestWorkloadIncrease.recruiter} (+${sim.simulation.summary.largestWorkloadIncrease.delta})`
                : ""}
            </p>
          </ExecutiveCard>

          <ExecutiveCard>
            <SectionHeader title="Assignment Simulation Queue" />
            <div className="mt-4">
              <QueueTable
                rows={sim.simulation.sections.assignmentSimulation}
                emptyLabel="No simulated assignments"
              />
            </div>
          </ExecutiveCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <ExecutiveCard>
              <SectionHeader title="Workload Impact" />
              <div className="mt-4">
                <WorkloadComparisonTable rows={sim.simulation.sections.workloadImpact} />
              </div>
            </ExecutiveCard>
            <ExecutiveCard>
              <SectionHeader title="Before / After Comparison" />
              <div className="mt-4">
                <WorkloadComparisonTable rows={sim.simulation.sections.beforeAfterComparison} />
              </div>
            </ExecutiveCard>
          </div>

          <ExecutiveCard>
            <SectionHeader title="Territory Heat Map" />
            <div className="mt-4">
              <TerritoryHeatTable rows={sim.simulation.sections.territoryHeatMap.slice(0, 20)} />
            </div>
          </ExecutiveCard>

          <ExecutiveCard>
            <SectionHeader title="Projected Paperwork Queue" />
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {sim.simulation.sections.projectedPaperworkQueue.length === 0 ? (
                <li>No candidates projected to advance to paperwork</li>
              ) : (
                sim.simulation.sections.projectedPaperworkQueue.map((row) => (
                  <li key={row.candidateId} className="rounded-lg border border-white/5 px-3 py-2">
                    <span className="font-medium text-white">{row.candidateName}</span>
                    {" → "}
                    {row.recruiter} ({row.p157Action}, {row.confidence}%)
                  </li>
                ))
              )}
            </ul>
          </ExecutiveCard>

          <ExecutiveCard variant="premium">
            <SectionHeader
              title="Post-Assignment Outcome Diagnosis"
              subtitle="P158.2 — why assigned candidates do not advance to paperwork"
            />
            {sim.simulation.outcomeDiagnosis ? (
              <>
                <p className="mt-3 text-sm text-slate-300">
                  {sim.simulation.outcomeDiagnosis.summary.safestNextChange}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard
                    label="→ Send Paperwork"
                    value={sim.simulation.outcomeDiagnosis.summary.sendPaperworkCount}
                  />
                  <MetricCard
                    label="→ Manual Review"
                    value={sim.simulation.outcomeDiagnosis.summary.manualReviewCount}
                  />
                  <MetricCard
                    label="Est. paperwork lift"
                    value={sim.simulation.outcomeDiagnosis.summary.estimatedPaperworkLift}
                  />
                  <MetricCard
                    label="Workflow gate"
                    value={
                      sim.simulation.outcomeDiagnosis.summary.blockerCounts.find(
                        (b) => b.code === "workflow_state_issue",
                      )?.count ?? 0
                    }
                  />
                </div>
              </>
            ) : null}
            <div className="mt-4">
              <PostAssignmentDiagnosisTable rows={sim.simulation.sections.postAssignmentDiagnosis} />
            </div>
          </ExecutiveCard>

          <ExecutiveCard>
            <SectionHeader title="Warnings" />
            <div className="mt-4">
              <SimulationWarningsList warnings={sim.simulation.sections.warnings} />
            </div>
          </ExecutiveCard>

          <ExecutiveCard>
            <SectionHeader title="Confidence Distribution" />
            <ul className="mt-4 flex flex-wrap gap-3 text-sm text-slate-300">
              {sim.simulation.sections.confidenceDistribution.map((bucket) => (
                <li key={bucket.label} className="rounded-lg border border-white/5 px-3 py-2">
                  {bucket.label}: <span className="text-white">{bucket.count}</span>
                </li>
              ))}
            </ul>
          </ExecutiveCard>
        </>
      ) : sim.error ? (
        <ExecutivePanelError
          title="Assignment Simulation"
          message={sim.error}
          onRetry={() => void sim.refresh()}
        />
      ) : null}
    </div>
  );
}
