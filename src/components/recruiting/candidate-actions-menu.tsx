"use client";

import { addDmToRoster, addRecruiterToRoster } from "@/lib/recruiter-roster";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";
import { CANDIDATE_WORKFLOW_STATUSES, type CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { useEffect, useRef, useState } from "react";

export type CandidateRowAction =
  | { kind: "open-drawer" }
  | { kind: "change-workflow"; status: CandidateWorkflowStatus }
  | { kind: "assign-recruiter"; recruiter: string }
  | { kind: "assign-dm"; dm: string }
  | { kind: "add-note"; note: string };

type CandidateActionsMenuProps = {
  onAction: (action: CandidateRowAction) => void;
  rosters: RecruiterRosters;
  onRostersUpdated?: (rosters: RecruiterRosters) => void;
};

export function CandidateActionsMenu({ onAction, rosters, onRostersUpdated }: CandidateActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [recruiterOpen, setRecruiterOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [recruiters, setRecruiters] = useState<string[]>(rosters.recruiters);
  const [dms, setDms] = useState<string[]>(rosters.dms);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setWorkflowOpen(false);
        setRecruiterOpen(false);
        setDmOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function closeMenus() {
    setOpen(false);
    setWorkflowOpen(false);
    setRecruiterOpen(false);
    setDmOpen(false);
  }

  function run(action: CandidateRowAction) {
    closeMenus();
    onAction(action);
  }

  function pickRecruiter() {
    const custom = window.prompt("Recruiter name (saved to roster)", recruiters[0] ?? "Unassigned");
    if (custom === null) return;
    const trimmed = custom.trim();
    if (!trimmed) return;
    void addRecruiterToRoster(trimmed)
      .then((next) => {
        setRecruiters(next.recruiters);
        onRostersUpdated?.(next);
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : "Failed to save recruiter"));
    run({ kind: "assign-recruiter", recruiter: trimmed });
  }

  function pickDm() {
    const custom = window.prompt("DM name (saved to roster)", dms[0] ?? "Unassigned");
    if (custom === null) return;
    const trimmed = custom.trim();
    if (!trimmed) return;
    void addDmToRoster(trimmed)
      .then((next) => {
        setDms(next.dms);
        onRostersUpdated?.(next);
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : "Failed to save DM"));
    run({ kind: "assign-dm", dm: trimmed });
  }

  function addNote() {
    const note = window.prompt("Add local workflow note");
    if (!note?.trim()) return;
    run({ kind: "add-note", note: note.trim() });
  }

  return (
    <div ref={rootRef} className="relative inline-block" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => {
            const next = !value;
            if (next) {
              setRecruiters(rosters.recruiters);
              setDms(rosters.dms);
            }
            return next;
          });
        }}
        className="rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-200 hover:bg-zinc-700/80"
      >
        Actions
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[12rem] rounded-md border border-zinc-700 bg-zinc-950 py-1 shadow-lg shadow-black/40"
        >
          <div className="relative">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2.5 py-1 text-left text-[11px] text-zinc-200 hover:bg-zinc-800/80"
              onClick={() => setWorkflowOpen((value) => !value)}
            >
              Change workflow
              <span className="text-zinc-500">{workflowOpen ? "▴" : "▾"}</span>
            </button>
            {workflowOpen ? (
              <div className="max-h-40 overflow-y-auto border-t border-zinc-800/80 py-1">
                {CANDIDATE_WORKFLOW_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1 text-left text-[11px] text-zinc-300 hover:bg-zinc-800/80"
                    onClick={() => run({ kind: "change-workflow", status })}
                  >
                    {status}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative border-t border-zinc-800/80">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2.5 py-1 text-left text-[11px] text-zinc-200 hover:bg-zinc-800/80"
              onClick={() => setRecruiterOpen((value) => !value)}
            >
              Assign recruiter
              <span className="text-zinc-500">{recruiterOpen ? "▴" : "▾"}</span>
            </button>
            {recruiterOpen ? (
              <div className="max-h-32 overflow-y-auto border-t border-zinc-800/80 py-1">
                {recruiters.map((recruiter) => (
                  <button
                    key={recruiter}
                    type="button"
                    className="block w-full px-3 py-1 text-left text-[11px] text-zinc-300 hover:bg-zinc-800/80"
                    onClick={() => run({ kind: "assign-recruiter", recruiter })}
                  >
                    {recruiter}
                  </button>
                ))}
                <button
                  type="button"
                  className="block w-full px-3 py-1 text-left text-[11px] text-teal-300 hover:bg-zinc-800/80"
                  onClick={pickRecruiter}
                >
                  + Add recruiter…
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative border-t border-zinc-800/80">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2.5 py-1 text-left text-[11px] text-zinc-200 hover:bg-zinc-800/80"
              onClick={() => setDmOpen((value) => !value)}
            >
              Assign DM
              <span className="text-zinc-500">{dmOpen ? "▴" : "▾"}</span>
            </button>
            {dmOpen ? (
              <div className="max-h-32 overflow-y-auto border-t border-zinc-800/80 py-1">
                {dms.map((dm) => (
                  <button
                    key={dm}
                    type="button"
                    className="block w-full px-3 py-1 text-left text-[11px] text-zinc-300 hover:bg-zinc-800/80"
                    onClick={() => run({ kind: "assign-dm", dm })}
                  >
                    {dm}
                  </button>
                ))}
                <button
                  type="button"
                  className="block w-full px-3 py-1 text-left text-[11px] text-teal-300 hover:bg-zinc-800/80"
                  onClick={pickDm}
                >
                  + Add DM…
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            role="menuitem"
            className="block w-full border-t border-zinc-800/80 px-2.5 py-1 text-left text-[11px] text-zinc-200 hover:bg-zinc-800/80"
            onClick={addNote}
          >
            Add note
          </button>

          <button
            type="button"
            role="menuitem"
            className="block w-full border-t border-zinc-800/80 px-2.5 py-1 text-left text-[11px] text-zinc-200 hover:bg-zinc-800/80"
            onClick={() => run({ kind: "open-drawer" })}
          >
            Open drawer
          </button>
        </div>
      ) : null}
    </div>
  );
}
