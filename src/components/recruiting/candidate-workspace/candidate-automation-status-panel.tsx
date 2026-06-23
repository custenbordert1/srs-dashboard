"use client";

import type { CandidateFunnelAutomation, FunnelRiskLevel } from "@/lib/hiring-funnel-automation/types";
import type { RecruiterAssignmentSource } from "@/lib/candidate-workflow-types";

const RISK_STYLES: Record<FunnelRiskLevel, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-100",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

type CandidateAutomationStatusPanelProps = {
  automation: CandidateFunnelAutomation;
  assignmentSource?: RecruiterAssignmentSource | null;
};

function assignmentSourceLabel(source: RecruiterAssignmentSource): string {
  return source === "auto" ? "Auto assigned" : "Manual assigned";
}

export function CandidateAutomationStatusPanel({
  automation,
  assignmentSource = null,
}: CandidateAutomationStatusPanelProps) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Automation & risk</h3>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${RISK_STYLES[automation.risk]}`}
        >
          {automation.risk} risk
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
            automation.automationEligible
              ? "border-teal-500/30 bg-teal-500/10 text-teal-100"
              : "border-zinc-700 bg-zinc-950 text-zinc-400"
          }`}
        >
          {automation.automationEligible ? "Automation eligible" : "Manual review required"}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Stage</dt>
          <dd className="text-zinc-200">{automation.stage}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Owner</dt>
          <dd className="text-zinc-200">{automation.owner}</dd>
        </div>
        {assignmentSource ? (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Assignment source</dt>
            <dd className="text-zinc-200">{assignmentSourceLabel(assignmentSource)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Next required action</dt>
          <dd className="text-zinc-100">{automation.nextAction}</dd>
        </div>
        {automation.taskLabel ? (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Auto-generated task</dt>
            <dd className="text-teal-100">{automation.taskLabel}</dd>
          </div>
        ) : null}
      </dl>

      {automation.riskReasons.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Risk signals</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
            {automation.riskReasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
