"use client";

import type { DmOnboardingSnapshot } from "@/lib/dm-dashboard/dm-onboarding-snapshot";

type DmOnboardingStatusCardProps = {
  onboarding: DmOnboardingSnapshot;
};

export function DmOnboardingStatusCard({ onboarding }: DmOnboardingStatusCardProps) {
  const rows = [
    { label: "Paperwork sent", value: onboarding.paperworkSent },
    { label: "Paperwork signed", value: onboarding.paperworkSigned },
    { label: "DD not requested", value: onboarding.ddNotRequested },
    { label: "DD requested", value: onboarding.ddRequested },
    { label: "DD received", value: onboarding.ddReceived },
    { label: "DD approved", value: onboarding.ddApproved },
    { label: "Awaiting DD verification", value: onboarding.awaitingDdVerification },
  ];

  return (
    <section className="rounded-xl border border-violet-500/20 bg-zinc-900/50 p-4">
      <h2 className="text-sm font-semibold text-violet-100">Onboarding & payroll (territory)</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Paperwork and direct deposit status for candidates in your assigned states only.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
          >
            <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{row.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-50">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
