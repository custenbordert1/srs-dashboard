"use client";

import { useState } from "react";

type CandidateNotesPanelProps = {
  notes: string[];
  onAddNote: (note: string) => void;
};

export function CandidateNotesPanel({ notes, onAddNote }: CandidateNotesPanelProps) {
  const [draft, setDraft] = useState("");

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Notes</h3>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Quick add note…"
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-xs text-zinc-100"
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            const note = draft.trim();
            if (!note) return;
            onAddNote(note);
            setDraft("");
          }}
          className="rounded-md border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-100 disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {notes.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No recruiter notes yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((note, index) => (
            <li
              key={`${index}-${note.slice(0, 16)}`}
              className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-300"
            >
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
