"use client";

import {
  directDepositPipelineStep,
  directDepositStatusLabel,
  type DirectDepositStatus,
} from "@/lib/direct-deposit-types";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";
import { useState } from "react";

type CandidatePayrollOnboardingPanelProps = {
  paperworkStatus: PaperworkStatus;
  directDepositStatus: DirectDepositStatus;
  directDepositRequestedAt: string | null;
  directDepositLastReminderAt: string | null;
  directDepositNotes: string | null;
  directDepositTriggeredByUserId?: string | null;
  directDepositLastDeliveryMode?: "log" | "resend" | null;
  directDepositLastHrCopyIncluded?: boolean | null;
  directDepositLastHrBccAddress?: string | null;
  hasCandidateEmail: boolean;
  busy?: boolean;
  onAction: (
    action: "resend" | "mark-received" | "mark-approved" | "set-notes",
    payload?: { notes?: string },
  ) => void | Promise<void>;
};

function PipelineStep({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active?: boolean;
}) {
  const icon = done ? "✅" : active ? "⏳" : "○";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] ${
        done
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
          : active
            ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
            : "border-zinc-700 bg-zinc-950/60 text-zinc-500"
      }`}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function formatWhen(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function CandidatePayrollOnboardingPanel({
  paperworkStatus,
  directDepositStatus,
  directDepositRequestedAt,
  directDepositLastReminderAt,
  directDepositNotes,
  directDepositTriggeredByUserId = null,
  directDepositLastDeliveryMode = null,
  directDepositLastHrCopyIncluded = null,
  directDepositLastHrBccAddress = null,
  hasCandidateEmail,
  busy = false,
  onAction,
}: CandidatePayrollOnboardingPanelProps) {
  const [notesDraft, setNotesDraft] = useState(directDepositNotes ?? "");
  const steps = directDepositPipelineStep(paperworkStatus, directDepositStatus);

  return (
    <section className="space-y-3 rounded-xl border border-violet-500/20 bg-zinc-900/50 p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
          Onboarding & payroll
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Status: {directDepositStatusLabel(directDepositStatus)}
          {directDepositRequestedAt ? ` · requested ${formatWhen(directDepositRequestedAt)}` : ""}
          {directDepositLastReminderAt ? ` · last email ${formatWhen(directDepositLastReminderAt)}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <PipelineStep label="Paperwork signed" done={steps.paperworkSigned} />
        <PipelineStep label="DD requested" done={steps.ddRequested} active={steps.paperworkSigned && !steps.ddReceived} />
        <PipelineStep label="DD received" done={steps.ddReceived} active={steps.ddRequested && !steps.ddApproved} />
        <PipelineStep label="DD approved" done={steps.ddApproved} active={steps.ddReceived && !steps.ddApproved} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !steps.paperworkSigned || !hasCandidateEmail || directDepositStatus === "approved"}
          title={
            !hasCandidateEmail
              ? "Candidate email required"
              : !steps.paperworkSigned
                ? "Available after paperwork is signed"
                : "Resend HR direct deposit verification email"
          }
          onClick={() => onAction("resend")}
          className="rounded-md border border-teal-600/40 bg-teal-600/10 px-2 py-1 text-[11px] font-medium text-teal-100 hover:bg-teal-600/20 disabled:opacity-40"
        >
          Resend DD email
        </button>
        <button
          type="button"
          disabled={busy || !steps.ddRequested || directDepositStatus === "received" || directDepositStatus === "approved"}
          onClick={() => onAction("mark-received")}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
        >
          Mark DD received
        </button>
        <button
          type="button"
          disabled={busy || directDepositStatus !== "received"}
          onClick={() => onAction("mark-approved")}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
        >
          Mark DD approved
        </button>
      </div>

      <div className="space-y-1.5 border-t border-zinc-800/80 pt-2">
        <label className="block text-[10px] text-zinc-500">Payroll notes</label>
        <textarea
          className="min-h-[4rem] w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          placeholder="Bank doc received via text, routing verified…"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("set-notes", { notes: notesDraft })}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          Save payroll notes
        </button>
      </div>
      <div className="rounded-md border border-zinc-800/80 bg-zinc-950/60 px-2 py-1.5 text-[10px] text-zinc-500">
        <p className="font-medium text-zinc-400">DD email audit</p>
        <p className="mt-0.5">
          Requested: {formatWhen(directDepositRequestedAt)}
          {directDepositLastReminderAt && directDepositLastReminderAt !== directDepositRequestedAt
            ? ` · Last resend: ${formatWhen(directDepositLastReminderAt)}`
            : ""}
        </p>
        <p className="mt-0.5">
          Delivery: {directDepositLastDeliveryMode ?? "—"}
          {directDepositTriggeredByUserId
            ? ` · Triggered by ${directDepositTriggeredByUserId}`
            : directDepositRequestedAt
              ? " · Triggered by automation (webhook)"
              : ""}
        </p>
        <p className="mt-0.5">
          HR copy:{" "}
          {directDepositLastHrCopyIncluded
            ? `yes${directDepositLastHrBccAddress ? ` (${directDepositLastHrBccAddress})` : ""}`
            : directDepositRequestedAt
              ? "no"
              : "—"}
        </p>
      </div>
      <p className="text-[10px] text-zinc-600">
        Direct deposit is never auto-approved. HR/recruiter must mark received, then approved.
      </p>
    </section>
  );
}
