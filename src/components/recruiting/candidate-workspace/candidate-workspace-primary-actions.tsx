"use client";

import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";

const actionBtnClass =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtnClass = `${actionBtnClass} border-teal-500/45 bg-teal-500/15 text-teal-50 hover:bg-teal-500/25`;
const secondaryBtnClass = `${actionBtnClass} border-zinc-700 bg-zinc-900/60 text-zinc-100 hover:bg-zinc-800`;

function isPaperworkAlreadySent(status: PaperworkStatus): boolean {
  return status === "sent" || status === "viewed" || status === "signed";
}

type CandidateWorkspacePrimaryActionsProps = {
  paperworkStatus: PaperworkStatus;
  paperworkViewed: boolean;
  paperworkSigned: boolean;
  sending?: boolean;
  canSend: boolean;
  breezyUrl: string | null;
  hasResume: boolean;
  hasQuestionnaire: boolean;
  onOpenBreezy: () => void;
  onScrollToResume: () => void;
  onScrollToQuestionnaire: () => void;
  onSendPaperwork: () => void;
  onRefreshStatus: () => void;
};

export function CandidateWorkspacePrimaryActions({
  paperworkStatus,
  paperworkViewed,
  paperworkSigned,
  sending,
  canSend,
  breezyUrl,
  hasResume,
  hasQuestionnaire,
  onOpenBreezy,
  onScrollToResume,
  onScrollToQuestionnaire,
  onSendPaperwork,
  onRefreshStatus,
}: CandidateWorkspacePrimaryActionsProps) {
  const alreadySent = isPaperworkAlreadySent(paperworkStatus);

  return (
    <section className="rounded-xl border border-teal-500/25 bg-teal-500/5 p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-teal-200/90">
        Primary actions
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryBtnClass}
          disabled={!breezyUrl}
          title={breezyUrl ? "Open candidate in Breezy" : "Breezy link unavailable"}
          onClick={onOpenBreezy}
        >
          Open Breezy
        </button>
        <button
          type="button"
          className={secondaryBtnClass}
          disabled={!hasResume}
          title={hasResume ? "Jump to resume" : "Resume not available yet"}
          onClick={onScrollToResume}
        >
          Resume
        </button>
        <button
          type="button"
          className={secondaryBtnClass}
          disabled={!hasQuestionnaire}
          title={hasQuestionnaire ? "Jump to questionnaire" : "Questionnaire not available yet"}
          onClick={onScrollToQuestionnaire}
        >
          Questionnaire
        </button>
        {alreadySent ? (
          <div className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-700/80 bg-zinc-950/70 px-3 py-2 text-xs">
            <span className="font-medium text-zinc-100">
              Paperwork: {paperworkStatusLabel(paperworkStatus)}
            </span>
            <span className={paperworkViewed ? "text-teal-200" : "text-zinc-500"}>
              Viewed {paperworkViewed ? "✓" : "—"}
            </span>
            <span className={paperworkSigned ? "text-emerald-200" : "text-zinc-500"}>
              Signed {paperworkSigned ? "✓" : "—"}
            </span>
          </div>
        ) : (
          <button
            type="button"
            className={primaryBtnClass}
            disabled={!canSend || sending}
            onClick={onSendPaperwork}
          >
            {sending ? "Sending…" : "Send Paperwork"}
          </button>
        )}
        <button type="button" className={secondaryBtnClass} onClick={onRefreshStatus}>
          Refresh Status
        </button>
      </div>
    </section>
  );
}
