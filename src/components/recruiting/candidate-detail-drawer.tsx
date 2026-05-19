"use client";

import { addDmToRoster, addRecruiterToRoster, loadDmRoster, loadRecruiterRoster } from "@/lib/recruiter-roster";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { CANDIDATE_WORKFLOW_STATUSES } from "@/lib/candidate-workflow-types";
import { useEffect, useState } from "react";

export type CandidateDrawerRow = {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  appliedDate: string;
  positionName: string;
  city: string;
  state: string;
  workflowStatus: CandidateWorkflowStatus;
  lastActionAt: string | null;
  nextActionNeeded: string;
  assignedRecruiter: string;
  assignedDM: string;
  notes: string[];
  history: Array<{ id: string; type: string; message: string; createdAt: string }>;
  overallCandidateScore: number | null;
  aiRecommendation: string;
  resumeKeywordScore: number | null;
  merchandisingExperienceScore: number | null;
  retailExperienceScore: number | null;
  travelFitScore: number | null;
};

type DrawerTab = "overview" | "workflow" | "notes" | "assignments" | "hellosign" | "ai";

type HelloSignPrep = {
  configured: boolean;
  statusLabel: string;
  message: string;
};

type CandidateDetailDrawerProps = {
  candidate: CandidateDrawerRow | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (status: CandidateWorkflowStatus) => void;
  onSaveAssignments: (recruiter: string, dm: string) => void;
  onAddNote: (note: string) => void;
  statusAgingDays: number | null;
  appliedAgingDays: number | null;
};

const DRAWER_TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "workflow", label: "Workflow" },
  { id: "notes", label: "Notes" },
  { id: "assignments", label: "Assignments" },
  { id: "hellosign", label: "HelloSign" },
  { id: "ai", label: "AI" },
];

function candidateDisplayName(candidate: CandidateDrawerRow): string {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  return name || candidate.email || "Unknown candidate";
}

function formatDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatAppliedDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function agingBadgeClass(days: number | null): string {
  if (days === null) return "bg-zinc-800/80 text-zinc-400 ring-zinc-600/40";
  if (days <= 3) return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/35";
  if (days <= 7) return "bg-amber-500/15 text-amber-200 ring-amber-500/35";
  return "bg-red-500/15 text-red-200 ring-red-500/35";
}

function AssignmentPanel({
  assignedRecruiter,
  assignedDM,
  onSave,
}: {
  assignedRecruiter: string;
  assignedDM: string;
  onSave: (recruiter: string, dm: string) => void;
}) {
  const [recruiters, setRecruiters] = useState(loadRecruiterRoster);
  const [dms, setDms] = useState(loadDmRoster);
  const [recruiter, setRecruiter] = useState(assignedRecruiter);
  const [dm, setDm] = useState(assignedDM);

  return (
    <div className="space-y-3">
      <label className="block text-[10px] text-zinc-500">
        Recruiter
        <select
          className="mt-0.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
          value={recruiter}
          onChange={(event) => setRecruiter(event.target.value)}
        >
          {recruiters.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[10px] text-zinc-500">
        DM
        <select
          className="mt-0.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
          value={dm}
          onChange={(event) => setDm(event.target.value)}
        >
          {dms.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Add recruiter to roster");
            if (!name?.trim()) return;
            setRecruiters(addRecruiterToRoster(name.trim()));
            setRecruiter(name.trim());
          }}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          + Recruiter
        </button>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Add DM to roster");
            if (!name?.trim()) return;
            setDms(addDmToRoster(name.trim()));
            setDm(name.trim());
          }}
          className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          + DM
        </button>
        <button
          type="button"
          onClick={() => onSave(recruiter.trim() || "Unassigned", dm.trim() || "Unassigned")}
          className="rounded-md border border-teal-500/40 bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-200 hover:bg-teal-500/20"
        >
          Save assignments
        </button>
      </div>
    </div>
  );
}

function NoteComposer({ onAddNote }: { onAddNote: (note: string) => void }) {
  const [noteDraft, setNoteDraft] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600"
          placeholder="Add a local note…"
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && noteDraft.trim()) {
              onAddNote(noteDraft.trim());
              setNoteDraft("");
            }
          }}
        />
        <button
          type="button"
          disabled={!noteDraft.trim()}
          onClick={() => {
            if (!noteDraft.trim()) return;
            onAddNote(noteDraft.trim());
            setNoteDraft("");
          }}
          className="shrink-0 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-200 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export function CandidateDetailDrawer({
  candidate,
  open,
  onClose,
  onStatusChange,
  onSaveAssignments,
  onAddNote,
  statusAgingDays,
  appliedAgingDays,
}: CandidateDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [helloSign, setHelloSign] = useState<HelloSignPrep | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/hellosign/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((parsed: { configured?: boolean; statusLabel?: string; message?: string }) => {
        if (cancelled) return;
        setHelloSign({
          configured: Boolean(parsed.configured),
          statusLabel: parsed.statusLabel ?? "Unknown",
          message: parsed.message ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) {
          setHelloSign({
            configured: false,
            statusLabel: "Unavailable",
            message: "Could not load HelloSign prep status.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !candidate) return null;

  const timeline = [...candidate.history].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const workflowEvents = timeline.filter((event) => event.type === "status");
  const assignmentEvents = timeline.filter((event) => event.type === "assignment");
  const noteEvents = timeline.filter((event) => event.type === "note");

  return (
    <>
      <button
        type="button"
        aria-label="Close candidate drawer"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-drawer-title"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <header className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Candidate detail</p>
              <h2 id="candidate-drawer-title" className="mt-0.5 text-lg font-semibold text-zinc-50">
                {candidateDisplayName(candidate)}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {candidate.positionName || "—"} · {candidate.city || "—"}, {candidate.state || "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
          <nav className="mt-3 flex flex-wrap gap-1">
            {DRAWER_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                  tab === item.id
                    ? "bg-teal-500/15 text-teal-200 ring-1 ring-teal-500/30"
                    : "text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {tab === "overview" ? (
            <div className="space-y-3 text-xs text-zinc-400">
              <p>
                <span className="text-zinc-500">Email:</span> {candidate.email || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Phone:</span> {candidate.phone || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Source / stage:</span> {candidate.source || "—"} · {candidate.stage || "—"}
              </p>
              <p>
                <span className="text-zinc-500">Applied:</span> {formatAppliedDate(candidate.appliedDate)}
              </p>
              <p>
                <span className="text-zinc-500">Workflow:</span> {candidate.workflowStatus}
              </p>
              <p>
                <span className="text-zinc-500">Next action:</span> {candidate.nextActionNeeded}
              </p>
              <p>
                <span className="text-zinc-500">Recruiter / DM:</span> {candidate.assignedRecruiter} · {candidate.assignedDM}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${agingBadgeClass(statusAgingDays)}`}>
                  Status {statusAgingDays === null ? "—" : `${statusAgingDays}d`}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${agingBadgeClass(appliedAgingDays)}`}>
                  Applied {appliedAgingDays === null ? "—" : `${appliedAgingDays}d`}
                </span>
              </div>
            </div>
          ) : null}

          {tab === "workflow" ? (
            <div className="space-y-3">
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                value={candidate.workflowStatus}
                onChange={(event) => onStatusChange(event.target.value as CandidateWorkflowStatus)}
              >
                {CANDIDATE_WORKFLOW_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              {workflowEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">No workflow status changes yet.</p>
              ) : (
                <ol className="space-y-2">
                  {workflowEvents.map((event) => (
                    <li key={event.id} className="border-l-2 border-zinc-700 pl-2">
                      <p className="text-xs text-zinc-200">{event.message}</p>
                      <p className="text-[10px] text-zinc-600">{formatDate(event.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "notes" ? (
            <div className="space-y-3">
              <NoteComposer key={candidate.candidateId} onAddNote={onAddNote} />
              {candidate.notes.length === 0 && noteEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">No notes yet.</p>
              ) : (
                <ol className="space-y-2">
                  {noteEvents.map((event) => (
                    <li key={event.id} className="rounded bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
                      {event.message}
                      <p className="text-[10px] text-zinc-600">{formatDate(event.createdAt)}</p>
                    </li>
                  ))}
                  {[...candidate.notes].reverse().map((note, index) => (
                    <li
                      key={`${candidate.candidateId}-stored-note-${index}`}
                      className="rounded bg-zinc-950/60 px-2 py-1 text-xs text-zinc-300"
                    >
                      {note}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "assignments" ? (
            <div className="space-y-4">
              <AssignmentPanel
                key={`${candidate.candidateId}-${candidate.assignedRecruiter}-${candidate.assignedDM}`}
                assignedRecruiter={candidate.assignedRecruiter}
                assignedDM={candidate.assignedDM}
                onSave={onSaveAssignments}
              />
              {assignmentEvents.length === 0 ? (
                <p className="text-xs text-zinc-600">No assignment changes yet.</p>
              ) : (
                <ol className="space-y-2">
                  {assignmentEvents.map((event) => (
                    <li key={event.id} className="border-l-2 border-zinc-700 pl-2">
                      <p className="text-xs text-zinc-200">{event.message}</p>
                      <p className="text-[10px] text-zinc-600">{formatDate(event.createdAt)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "hellosign" ? (
            <div className="space-y-2 text-xs">
              {helloSign ? (
                <>
                  <p className="text-zinc-300">{helloSign.statusLabel}</p>
                  <p className="text-zinc-500">{helloSign.message}</p>
                  <p className="text-[10px] text-zinc-600">
                    API key: {helloSign.configured ? "present" : "not configured"} · Send disabled (placeholder)
                  </p>
                </>
              ) : (
                <p className="text-zinc-600">Loading prep status…</p>
              )}
            </div>
          ) : null}

          {tab === "ai" ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <dt className="text-zinc-500">Overall</dt>
              <dd className="text-zinc-200">{candidate.overallCandidateScore ?? "Pending"}</dd>
              <dt className="text-zinc-500">Resume keywords</dt>
              <dd className="text-zinc-200">{candidate.resumeKeywordScore ?? "—"}</dd>
              <dt className="text-zinc-500">Merchandising</dt>
              <dd className="text-zinc-200">{candidate.merchandisingExperienceScore ?? "—"}</dd>
              <dt className="text-zinc-500">Retail</dt>
              <dd className="text-zinc-200">{candidate.retailExperienceScore ?? "—"}</dd>
              <dt className="text-zinc-500">Travel fit</dt>
              <dd className="text-zinc-200">{candidate.travelFitScore ?? "—"}</dd>
              <dt className="col-span-2 text-zinc-500">Recommendation</dt>
              <dd className="col-span-2 text-zinc-400">{candidate.aiRecommendation}</dd>
            </dl>
          ) : null}
        </div>

        <footer className="border-t border-zinc-800 px-4 py-2 text-[10px] text-zinc-600">
          Local workflow only — no writes to Breezy, HelloSign, or MEL.
        </footer>
      </aside>
    </>
  );
}
