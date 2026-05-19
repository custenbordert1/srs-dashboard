"use client";

import type { PrioritizationQueues } from "@/lib/candidate-prioritization";
import type { RecruiterProductivityRow } from "@/lib/recruiter-productivity";
import type { IntegrationPrepStatus } from "@/lib/integration-prep";

type CandidateAutomationPanelsProps = {
  queues: PrioritizationQueues;
  productivity: RecruiterProductivityRow[];
  onOpenCandidate: (candidateId: string) => void;
};

function QueueCard({
  title,
  rows,
  onOpenCandidate,
}: {
  title: string;
  rows: PrioritizationQueues[keyof PrioritizationQueues];
  onOpenCandidate: (candidateId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</p>
      <ul className="mt-2 space-y-1">
        {rows.length === 0 ? (
          <li className="text-xs text-zinc-600">No candidates</li>
        ) : (
          rows.map((row) => (
            <li key={row.candidateId}>
              <button
                type="button"
                onClick={() => onOpenCandidate(row.candidateId)}
                className="w-full truncate text-left text-xs text-zinc-300 hover:text-teal-200"
              >
                {row.name} · {row.aiGrade} · {row.reason}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function IntegrationPrepLegend({ items }: { items: IntegrationPrepStatus[] }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-lg border px-2 py-1.5 text-[10px] ${
            item.ready
              ? "border-teal-500/30 bg-teal-500/5 text-teal-200"
              : "border-zinc-700 bg-zinc-950/40 text-zinc-500"
          }`}
        >
          <p className="font-medium">{item.label}</p>
          <p className="mt-0.5 text-zinc-500">{item.statusLabel}</p>
        </div>
      ))}
    </div>
  );
}

export function CandidateAutomationPanels({
  queues,
  productivity,
  onOpenCandidate,
}: CandidateAutomationPanelsProps) {
  const samplePrep: IntegrationPrepStatus[] = [
    {
      id: "hellosign",
      label: "HelloSign",
      ready: true,
      statusLabel: "Prep layer active",
      missingFields: [],
      message: "",
    },
    {
      id: "mel",
      label: "MEL rep load",
      ready: true,
      statusLabel: "Prep layer active",
      missingFields: [],
      message: "",
    },
    {
      id: "training",
      label: "Training assign",
      ready: true,
      statusLabel: "Prep layer active",
      missingFields: [],
      message: "",
    },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Prioritization queue</h2>
        <p className="mt-1 text-sm text-zinc-500">AI-ranked work queues for recruiter focus.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <QueueCard title="Newest qualified" rows={queues.newestQualified} onOpenCandidate={onOpenCandidate} />
          <QueueCard title="Aging applied" rows={queues.agingApplied} onOpenCandidate={onOpenCandidate} />
          <QueueCard title="Recruiter assigned" rows={queues.recruiterAssigned} onOpenCandidate={onOpenCandidate} />
          <QueueCard title="High AI score" rows={queues.highAiScore} onOpenCandidate={onOpenCandidate} />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Recruiter productivity</h2>
        <p className="mt-1 text-sm text-zinc-500">Derived from local workflow history (not external ATS writes).</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[640px] w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="py-1 pr-3">Recruiter</th>
                <th className="py-1 pr-3">Reviewed</th>
                <th className="py-1 pr-3">Paperwork sent</th>
                <th className="py-1 pr-3">Avg response</th>
                <th className="py-1 pr-3">Workflow aging</th>
                <th className="py-1">Hires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {productivity.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-zinc-600">
                    No recruiter workflow activity yet.
                  </td>
                </tr>
              ) : (
                productivity.map((row) => (
                  <tr key={row.recruiter}>
                    <td className="py-1.5 pr-3 font-medium text-zinc-100">{row.recruiter}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.candidatesReviewed}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.paperworkSent}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.avgResponseDays ?? "—"}d</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.workflowAgingDays ?? "—"}d</td>
                    <td className="py-1.5 tabular-nums">{row.hires}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <IntegrationPrepLegend items={samplePrep} />
      </section>
    </div>
  );
}
